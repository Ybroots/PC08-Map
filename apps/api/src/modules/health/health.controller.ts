import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from "@nestjs/terminus";

/**
 * HealthController
 *
 * Provides liveness and readiness probes for load balancer / container orchestration.
 * This is the ONLY controller active in T00.
 *
 * GET /api/v1/health/live  - liveness: is the process alive?
 * GET /api/v1/health/ready - readiness: can the process serve traffic?
 */
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get("live")
  @HealthCheck()
  liveness() {
    // Basic liveness: process is alive and heap is below 512 MB
    return this.health.check([
      () => this.memory.checkHeap("memory_heap", 512 * 1024 * 1024),
    ]);
  }

  @Get("ready")
  @HealthCheck()
  readiness() {
    // T00 stub: always ready. Add DB/queue checks in T04.
    return this.health.check([
      () => this.memory.checkHeap("memory_heap", 512 * 1024 * 1024),
    ]);
  }
}
