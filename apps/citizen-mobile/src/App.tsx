import React, { useMemo } from "react";
import { Platform } from "react-native";
import { SosScreen } from "./features/sos/SosScreen";
import { createNativeSosRuntime } from "./features/sos/runtime";
import { NativeConfigurationBlockedScreen } from "./NativeConfigurationBlockedScreen";
import { resolveNativeSosBootstrapConfig } from "./native-config";

export interface NativeAppProps {
  readonly development?: boolean;
  readonly platform?: string;
}

export function NativeApp({
  development = __DEV__,
  platform = Platform.OS,
}: NativeAppProps) {
  const config = useMemo(
    () => resolveNativeSosBootstrapConfig(development, platform),
    [development, platform],
  );
  const runtime = useMemo(
    () => (config ? createNativeSosRuntime(config) : undefined),
    [config],
  );
  if (!runtime) return <NativeConfigurationBlockedScreen />;
  return <SosScreen {...runtime} />;
}

export default function App() {
  return <NativeApp />;
}
