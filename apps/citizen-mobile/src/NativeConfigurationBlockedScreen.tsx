import React from "react";
import {
  Linking,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SOS_COLORS } from "./features/sos/styles";

export interface NativeConfigurationBlockedScreenProps {
  readonly openPhone?: (url: string) => Promise<unknown>;
}

export function NativeConfigurationBlockedScreen({
  openPhone = (url) => Linking.openURL(url),
}: NativeConfigurationBlockedScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.sheet}>
        <Text style={styles.eyebrow}>TÍN HIỆU KHẨN CẤP</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Kênh gửi SOS chưa sẵn sàng
        </Text>
        <View accessibilityRole="alert" style={styles.receiptStamp}>
          <Text style={styles.receiptText}>KHÔNG CÓ DỮ LIỆU ĐÃ GỬI</Text>
        </View>
        <Text style={styles.body}>
          Ứng dụng chưa có cấu hình kết nối server cho bản phát hành này. Hãy
          gọi trực tiếp số phù hợp và chia sẻ vị trí bằng cuộc gọi nếu có thể.
        </Text>
        <View style={styles.callGrid}>
          {["112", "113", "114", "115"].map((number) => (
            <Pressable
              key={number}
              accessibilityLabel={`Gọi số khẩn cấp ${number}`}
              accessibilityRole="link"
              onPress={() => void openPhone(`tel:${number}`)}
              style={styles.callButton}
            >
              <Text style={styles.callNumber}>{number}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.footnote}>
          Cuộc gọi hoạt động độc lập với kênh gửi dữ liệu của ứng dụng.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: SOS_COLORS.paper,
  },
  sheet: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 18,
  },
  eyebrow: {
    color: SOS_COLORS.rescueRed,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: {
    color: SOS_COLORS.nightBlue,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  receiptStamp: {
    alignSelf: "flex-start",
    borderWidth: 2,
    borderColor: SOS_COLORS.warning,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: SOS_COLORS.warningSurface,
  },
  receiptText: {
    color: SOS_COLORS.warning,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1,
  },
  body: {
    color: SOS_COLORS.muted,
    fontSize: 17,
    lineHeight: 25,
  },
  callGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  callButton: {
    minWidth: 72,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SOS_COLORS.rescueRed,
    borderRadius: 12,
    backgroundColor: SOS_COLORS.surface,
  },
  callNumber: {
    color: SOS_COLORS.rescueRedDark,
    fontSize: 20,
    fontWeight: "900",
  },
  footnote: {
    color: SOS_COLORS.nightBlue,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
});
