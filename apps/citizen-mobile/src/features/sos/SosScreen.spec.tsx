import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { SosAcceptedDto } from "@atgt/contracts";
import {
  LocationUnavailableError,
  SOS_QUEUE_VERSION,
  SosQueueItemSchema,
  type SosQueueEnvelope,
} from "./model";
import type { ConnectivityPort, LocationPort } from "./ports";
import { DEFAULT_SOS_INCIDENT_TYPES, SosScreen } from "./SosScreen";

const ACK: SosAcceptedDto = {
  publicCode: "01ABCDEFGHJK",
  status: "RECEIVED",
  receivedAt: "2026-08-17T04:00:01.000Z",
  emergencyContacts: [{ name: "Cuu nan - Cuu ho", number: "112", type: "112" }],
};

function queue(acknowledged: boolean): SosQueueEnvelope {
  const item = SosQueueItemSchema.parse({
    clientEventId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-08-17T04:00:00.000Z",
    retryCount: 0,
    mediaChecksum: null,
    deliveryState: acknowledged ? "SERVER_ACKNOWLEDGED" : "SAVED_ON_DEVICE",
    payload: {
      coordinateLongitude: 108.4384,
      coordinateLatitude: 11.9404,
      accuracyMeters: 20,
      incidentType: "TRAFFIC_ACCIDENT",
      clientEventAt: "2026-08-17T04:00:00.000Z",
    },
    acknowledgement: acknowledged ? ACK : undefined,
  });
  return { version: SOS_QUEUE_VERSION, items: [item] };
}

function connectivity(initial: boolean): ConnectivityPort {
  return {
    isOnline: async () => initial,
    subscribe: () => () => undefined,
  };
}

const location: LocationPort = {
  getCurrentFix: async () => ({
    coordinateLongitude: 108.4384,
    coordinateLatitude: 11.9404,
    accuracyMeters: 20,
    capturedAt: "2026-08-17T04:00:00.000Z",
  }),
};

async function renderScreen(options?: {
  acknowledged?: boolean;
  denied?: boolean;
  openPhone?: jest.Mock;
}) {
  const initial: SosQueueEnvelope = options?.acknowledged
    ? queue(true)
    : { version: SOS_QUEUE_VERSION, items: [] };
  const submitted = options?.acknowledged ? queue(true) : queue(false);
  const submission = {
    recover: jest.fn(async () => initial),
    drain: jest.fn(async () => initial),
    submit: jest.fn(async () => ({
      item: submitted.items[0]!,
      queue: submitted,
    })),
  };
  const locationPort: LocationPort = options?.denied
    ? {
        getCurrentFix: async () => {
          throw new LocationUnavailableError("PERMISSION_DENIED");
        },
      }
    : location;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <SosScreen
        connectivity={connectivity(false)}
        incidentTypes={DEFAULT_SOS_INCIDENT_TYPES}
        location={locationPort}
        now={() => new Date("2026-08-17T04:00:10.000Z")}
        openPhone={options?.openPhone}
        submission={submission}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  return { renderer, submission };
}

describe("SosScreen", () => {
  it("uses a confirmation step and labels delivery as device-only before ACK", async () => {
    const { renderer, submission } = await renderScreen();
    expect(
      renderer.root.findAllByProps({
        accessibilityLabel: expect.stringContaining("Mã hồ sơ"),
      }),
    ).toHaveLength(0);

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: "Kiểm tra và gửi SOS" })
        .props.onPress();
    });
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: "Xác nhận gửi SOS" })
        .props.onPress();
      await Promise.resolve();
    });

    expect(submission.submit).toHaveBeenCalledTimes(1);
    const text = renderer.root
      .findAllByType("Text" as never)
      .map((node) => node.children.join(" "))
      .join(" ");
    expect(text).toContain(
      "Đã lưu an toàn trên thiết bị. Server chưa nhận SOS.",
    );
    expect(text).not.toContain("01ABCDEFGHJK");
  });

  it("shows the public code only for a restored server acknowledgement", async () => {
    const { renderer } = await renderScreen({ acknowledged: true });
    expect(
      renderer.root.findByProps({
        accessibilityLabel: "Mã hồ sơ 01ABCDEFGHJK",
      }),
    ).toBeDefined();
  });

  it("keeps all emergency calls available and explicitly labeled", async () => {
    const openPhone = jest.fn(async () => undefined);
    const { renderer } = await renderScreen({ openPhone });
    for (const number of ["112", "113", "114", "115"]) {
      const call = renderer.root.findByProps({
        accessibilityLabel: `Gọi số khẩn cấp ${number}`,
      });
      expect(call.props.style.minHeight).toBeGreaterThanOrEqual(48);
    }
    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: "Gọi số khẩn cấp 112" })
        .props.onPress();
    });
    expect(openPhone).toHaveBeenCalledWith("tel:112");
  });

  it("directs permission-denied users to retry or call instead of enabling send", async () => {
    const { renderer } = await renderScreen({ denied: true });
    expect(
      renderer.root.findByProps({ accessibilityLabel: "Kiểm tra và gửi SOS" })
        .props.disabled,
    ).toBe(true);
    const text = renderer.root
      .findAllByType("Text" as never)
      .map((node) => node.children.join(" "))
      .join(" ");
    expect(text).toContain("Ứng dụng chưa có quyền vị trí");
  });

  it("drains the encrypted queue when connectivity returns", async () => {
    let listener: ((online: boolean) => void) | undefined;
    const acknowledged = queue(true);
    const submission = {
      recover: jest.fn(async () => queue(false)),
      drain: jest.fn(async () => acknowledged),
      submit: jest.fn(),
    };
    const network: ConnectivityPort = {
      isOnline: async () => false,
      subscribe: (next) => {
        listener = next;
        return () => undefined;
      },
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SosScreen
          connectivity={network}
          incidentTypes={DEFAULT_SOS_INCIDENT_TYPES}
          location={location}
          now={() => new Date("2026-08-17T04:00:10.000Z")}
          submission={submission}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      listener?.(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(submission.drain).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findByProps({
        accessibilityLabel: "Mã hồ sơ 01ABCDEFGHJK",
      }),
    ).toBeDefined();
  });
});
