import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import type { ConnectivityPort } from "./ports";

function online(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export class NativeConnectivityPort implements ConnectivityPort {
  async isOnline(): Promise<boolean> {
    return online(await NetInfo.fetch());
  }

  subscribe(listener: (isOnline: boolean) => void): () => void {
    return NetInfo.addEventListener((state) => listener(online(state)));
  }
}
