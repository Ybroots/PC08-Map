const React = require("react");

function nativeComponent(name) {
  return React.forwardRef(function MockNativeComponent(props, ref) {
    return React.createElement(name, { ...props, ref }, props.children);
  });
}

module.exports = {
  ActivityIndicator: nativeComponent("ActivityIndicator"),
  Pressable: nativeComponent("Pressable"),
  SafeAreaView: nativeComponent("SafeAreaView"),
  ScrollView: nativeComponent("ScrollView"),
  Text: nativeComponent("Text"),
  TextInput: nativeComponent("TextInput"),
  View: nativeComponent("View"),
  Linking: { openURL: async () => undefined },
  PermissionsAndroid: {
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: "android.permission.ACCESS_FINE_LOCATION",
    },
    RESULTS: { GRANTED: "granted" },
    request: async () => "granted",
  },
  Platform: {
    OS: "ios",
    select: (values) => values.ios ?? values.default,
  },
  StyleSheet: { create: (styles) => styles },
};
