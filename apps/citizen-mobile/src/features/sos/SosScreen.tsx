import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  assessLocationQuality,
  DEFAULT_LOCATION_QUALITY_POLICY,
  LocationUnavailableError,
  type LocationFix,
  type LocationQualityPolicy,
  type SosQueueEnvelope,
  type SosQueueItem,
} from "./model";
import type { ConnectivityPort, LocationPort } from "./ports";
import { SOS_COLORS, sosStyles as styles } from "./styles";
import type { SosSubmissionService } from "./submission-service";

export interface SosIncidentTypeOption {
  readonly code: string;
  readonly label: string;
}

export const DEFAULT_SOS_INCIDENT_TYPES: readonly SosIncidentTypeOption[] = [
  { code: "TRAFFIC_ACCIDENT", label: "Tai nạn giao thông" },
  { code: "CNCH", label: "Cứu nạn, cứu hộ" },
  { code: "VEHICLE_FIRE", label: "Xe bốc cháy" },
  { code: "ROAD_HAZARD", label: "Nguy hiểm trên đường" },
] as const;

export interface SosScreenProps {
  readonly submission: Pick<
    SosSubmissionService,
    "recover" | "submit" | "drain"
  >;
  readonly location: LocationPort;
  readonly connectivity: ConnectivityPort;
  readonly incidentTypes: readonly SosIncidentTypeOption[];
  readonly locationPolicy?: LocationQualityPolicy;
  readonly now?: () => Date;
  readonly openPhone?: (url: string) => Promise<unknown>;
}

const EMPTY_QUEUE: SosQueueEnvelope = { version: 1, items: [] };

export function SosScreen({
  submission,
  location,
  connectivity,
  incidentTypes,
  locationPolicy = DEFAULT_LOCATION_QUALITY_POLICY,
  now = () => new Date(),
  openPhone = (url) => Linking.openURL(url),
}: SosScreenProps) {
  if (incidentTypes.length === 0)
    throw new Error("SOS_INCIDENT_TYPES_REQUIRED");
  const [queue, setQueue] = useState<SosQueueEnvelope>(EMPTY_QUEUE);
  const [online, setOnline] = useState(false);
  const [fix, setFix] = useState<LocationFix>();
  const [locationError, setLocationError] = useState<string>();
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [selectedType, setSelectedType] = useState(
    incidentTypes[0]?.code ?? "TRAFFIC_ACCIDENT",
  );
  const [description, setDescription] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secureQueueError, setSecureQueueError] = useState(false);
  const submitGuard = useRef(false);

  const refreshLocation = useCallback(async () => {
    setLoadingLocation(true);
    setLocationError(undefined);
    try {
      setFix(await location.getCurrentFix());
    } catch (error) {
      setFix(undefined);
      setLocationError(
        error instanceof LocationUnavailableError &&
          error.code === "PERMISSION_DENIED"
          ? "Ứng dụng chưa có quyền vị trí. Hãy cấp quyền hoặc gọi số khẩn cấp."
          : "Chưa lấy được vị trí. Thử lại hoặc gọi số khẩn cấp.",
      );
    } finally {
      setLoadingLocation(false);
    }
  }, [location]);

  useEffect(() => {
    let mounted = true;
    submission
      .recover()
      .then((recovered) => mounted && setQueue(recovered))
      .catch(() => mounted && setSecureQueueError(true));
    connectivity
      .isOnline()
      .then((connected) => mounted && setOnline(connected))
      .catch(() => mounted && setOnline(false));
    const unsubscribe = connectivity.subscribe((connected) => {
      if (!mounted) return;
      setOnline(connected);
      if (connected) {
        submission
          .drain()
          .then((drained) => mounted && setQueue(drained))
          .catch(() => mounted && setSecureQueueError(true));
      }
    });
    void refreshLocation();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [connectivity, refreshLocation, submission]);

  const latest = queue.items.at(-1);
  const quality = useMemo(
    () => (fix ? assessLocationQuality(fix, now(), locationPolicy) : undefined),
    [fix, locationPolicy, now],
  );

  const send = useCallback(async () => {
    if (!fix || submitGuard.current || secureQueueError) return;
    submitGuard.current = true;
    setSubmitting(true);
    try {
      const result = await submission.submit(
        { fix, incidentType: selectedType, description },
        online,
      );
      setQueue(result.queue);
      setConfirming(false);
    } catch {
      setSecureQueueError(true);
    } finally {
      submitGuard.current = false;
      setSubmitting(false);
    }
  }, [description, fix, online, secureQueueError, selectedType, submission]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>TÍN HIỆU KHẨN CẤP</Text>
            <Text style={styles.title}>SOS Lâm Đồng</Text>
          </View>
          <View
            accessibilityLabel={
              online ? "Thiết bị đang có mạng" : "Thiết bị đang mất mạng"
            }
            style={[
              styles.networkBadge,
              online ? styles.onlineBadge : styles.offlineBadge,
            ]}
          >
            <Text style={styles.networkText}>
              {online ? "CÓ MẠNG" : "MẤT MẠNG"}
            </Text>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Vị trí gửi SOS</Text>
          {loadingLocation ? (
            <ActivityIndicator
              accessibilityLabel="Đang lấy vị trí"
              color={SOS_COLORS.nightBlue}
            />
          ) : fix ? (
            <>
              <Text style={styles.locationValue}>
                {fix.coordinateLatitude.toFixed(5)},{" "}
                {fix.coordinateLongitude.toFixed(5)} · ±
                {Math.round(fix.accuracyMeters)} m
              </Text>
              {quality?.isStale ? (
                <Text accessibilityRole="alert" style={styles.warningText}>
                  Vị trí đã cũ. Hãy thử cập nhật trước khi gửi nếu có thể.
                </Text>
              ) : null}
              {quality?.isLowAccuracy ? (
                <Text accessibilityRole="alert" style={styles.warningText}>
                  Độ chính xác thấp. SOS vẫn có thể gửi với thông tin này.
                </Text>
              ) : null}
            </>
          ) : (
            <Text accessibilityRole="alert" style={styles.warningText}>
              {locationError}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Lấy lại vị trí"
            onPress={() => void refreshLocation()}
            style={styles.linkButton}
          >
            <Text style={styles.linkButtonText}>Lấy lại vị trí</Text>
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Loại sự cố</Text>
          <View accessibilityRole="radiogroup" style={styles.typeGrid}>
            {incidentTypes.map((option) => {
              const selected = selectedType === option.code;
              return (
                <Pressable
                  key={option.code}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setSelectedType(option.code)}
                  style={[
                    styles.typeButton,
                    selected && styles.typeButtonSelected,
                  ]}
                >
                  <Text style={styles.typeText}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            accessibilityLabel="Mô tả ngắn, không bắt buộc"
            maxLength={500}
            multiline
            onChangeText={setDescription}
            placeholder="Mô tả ngắn để trực ban hiểu tình huống"
            placeholderTextColor={SOS_COLORS.muted}
            style={styles.input}
            value={description}
          />
        </View>

        {confirming ? (
          <View
            accessibilityRole="alert"
            style={[styles.panel, styles.confirmPanel]}
          >
            <Text style={styles.confirmTitle}>Xác nhận gửi SOS?</Text>
            <Text style={styles.body}>
              Hệ thống sẽ lưu yêu cầu an toàn trên thiết bị trước, rồi gửi vị
              trí và mô tả tới server.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Xác nhận gửi SOS"
              accessibilityState={{
                disabled: submitting || !fix || secureQueueError,
              }}
              disabled={submitting || !fix || secureQueueError}
              onPress={() => void send()}
              style={[
                styles.primaryButton,
                (submitting || !fix || secureQueueError) &&
                  styles.primaryButtonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? "ĐANG XỬ LÝ…" : "XÁC NHẬN GỬI SOS"}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kiểm tra và gửi SOS"
            accessibilityState={{ disabled: !fix || secureQueueError }}
            disabled={!fix || secureQueueError}
            onPress={() => setConfirming(true)}
            style={[
              styles.primaryButton,
              (!fix || secureQueueError) && styles.primaryButtonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>KIỂM TRA VÀ GỬI SOS</Text>
          </Pressable>
        )}

        <DeliveryReceipt item={latest} secureQueueError={secureQueueError} />

        <View style={[styles.panel, styles.safety]}>
          <Text style={styles.sectionLabel}>Giữ an toàn trước</Text>
          <Text style={styles.body}>
            Rời khỏi làn xe nếu có thể, cảnh báo người xung quanh và không đứng
            gần phương tiện đang cháy hoặc có nguy cơ phát nổ.
          </Text>
        </View>

        <View style={styles.panel}>
          <Text style={styles.sectionLabel}>Gọi trực tiếp khi cần</Text>
          <Text style={styles.body}>
            Cuộc gọi hoạt động độc lập với trạng thái gửi SOS.
          </Text>
          <View style={styles.callGrid}>
            {["112", "113", "114", "115"].map((number) => (
              <Pressable
                key={number}
                accessibilityRole="link"
                accessibilityLabel={`Gọi số khẩn cấp ${number}`}
                onPress={() => void openPhone(`tel:${number}`)}
                style={styles.callButton}
              >
                <Text style={styles.callNumber}>{number}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DeliveryReceipt({
  item,
  secureQueueError,
}: {
  readonly item?: SosQueueItem;
  readonly secureQueueError: boolean;
}) {
  const state = item?.deliveryState;
  const message = secureQueueError
    ? "Không thể mở hàng đợi bảo mật. SOS chưa được gửi; hãy gọi số khẩn cấp."
    : state === "SAVED_ON_DEVICE"
      ? "Đã lưu an toàn trên thiết bị. Server chưa nhận SOS."
      : state === "SENDING"
        ? "Đang gửi tới server. Chưa có xác nhận."
        : state === "SERVER_ACKNOWLEDGED"
          ? "Server đã nhận SOS."
          : state === "SEND_FAILED"
            ? "Gửi chưa thành công. SOS vẫn được lưu trên thiết bị."
            : "Chưa có SOS nào được lưu hoặc gửi.";
  return (
    <View style={[styles.panel, styles.receipt]}>
      <Text style={styles.sectionLabel}>Phiếu trạng thái</Text>
      <View accessibilityElementsHidden style={styles.receiptRail}>
        {[
          "SAVED_ON_DEVICE",
          "SENDING",
          "SERVER_ACKNOWLEDGED",
          "SEND_FAILED",
        ].map((step) => (
          <View
            key={step}
            style={[
              styles.receiptStep,
              state === step && styles.receiptStepActive,
              state === "SERVER_ACKNOWLEDGED" &&
                step === state &&
                styles.receiptStepAck,
              state === "SEND_FAILED" &&
                step === state &&
                styles.receiptStepFailed,
            ]}
          />
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.deliveryText}>
        {message}
      </Text>
      {item?.deliveryState === "SERVER_ACKNOWLEDGED" && item.acknowledgement ? (
        <View
          accessibilityLabel={`Mã hồ sơ ${item.acknowledgement.publicCode}`}
          style={styles.codeBox}
        >
          <Text style={styles.body}>Mã hồ sơ do server cấp</Text>
          <Text selectable style={styles.code}>
            {item.acknowledgement.publicCode}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
