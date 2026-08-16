# ADR-002: Mobile Framework and VietMap SDK

**Status**: ACCEPTED  
**Date**: 2026-08-16

## Decision

Use **React Native TypeScript** with native development build (not Expo Go managed).

## Rationale

- VietMap provides a React Native SDK
- Expo Go cannot support native VietMap modules
- Shared TypeScript contracts with backend
- Code sharing with citizen-web (Next.js) via packages/

## Consequences

- Requires Xcode (iOS) and Android SDK for native build
- VietMap SDK integration follows official React Native SDK docs
- Client VietMap key is restricted by bundle ID / package name
