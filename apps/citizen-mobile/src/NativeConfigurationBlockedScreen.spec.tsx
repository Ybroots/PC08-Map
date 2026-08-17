import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { NativeConfigurationBlockedScreen } from "./NativeConfigurationBlockedScreen";

describe("NativeConfigurationBlockedScreen", () => {
  it("states that no data was sent and keeps four calls accessible", () => {
    const openPhone = jest.fn(async () => undefined);
    const renderer = TestRenderer.create(
      <NativeConfigurationBlockedScreen openPhone={openPhone} />,
    );
    const text = renderer.root
      .findAllByType("Text" as never)
      .map((node) => node.children.join(" "))
      .join(" ");
    expect(text).toContain("KHÔNG CÓ DỮ LIỆU ĐÃ GỬI");
    for (const number of ["112", "113", "114", "115"]) {
      expect(
        renderer.root.findByProps({
          accessibilityLabel: `Gọi số khẩn cấp ${number}`,
        }),
      ).toBeDefined();
    }
    act(() => {
      renderer.root
        .findByProps({
          accessibilityLabel: "Gọi số khẩn cấp 115",
        })
        .props.onPress();
    });
    expect(openPhone).toHaveBeenCalledWith("tel:115");
  });
});
