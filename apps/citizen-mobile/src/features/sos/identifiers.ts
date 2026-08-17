import "react-native-get-random-values";
import { v4 as uuidV4 } from "uuid";
import type { IdentifierPort } from "./ports";

export const secureUuidIdentifiers: IdentifierPort = {
  newUuid: uuidV4,
};
