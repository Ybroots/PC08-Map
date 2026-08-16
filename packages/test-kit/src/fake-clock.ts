/**
 * FakeClock - Deterministic clock for testing
 *
 * All tests involving time-dependent logic (SLA timers, expiry, retention)
 * MUST use FakeClock. Never use Date.now() or new Date() directly in domain/app code.
 *
 * Usage:
 *   const clock = new FakeClock(new Date('2026-08-16T00:00:00Z'));
 *   clock.advance(60_000); // advance 60 seconds
 */
export class FakeClock {
  private currentTime: Date;

  constructor(initialTime?: Date) {
    this.currentTime = initialTime ?? new Date("2026-01-01T00:00:00.000Z");
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  nowIso(): string {
    return this.currentTime.toISOString();
  }

  /** Advance clock by given milliseconds */
  advance(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  /** Advance clock by seconds */
  advanceSeconds(seconds: number): void {
    this.advance(seconds * 1000);
  }

  /** Advance clock by minutes */
  advanceMinutes(minutes: number): void {
    this.advance(minutes * 60 * 1000);
  }

  /** Set clock to a specific time */
  setTime(date: Date): void {
    this.currentTime = new Date(date.getTime());
  }

  /** Check if a deadline has passed */
  isPast(deadline: Date): boolean {
    return this.currentTime >= deadline;
  }
}
