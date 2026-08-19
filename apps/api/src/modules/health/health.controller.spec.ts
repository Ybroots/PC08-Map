import { Test, TestingModule } from "@nestjs/testing";
import { MemoryHealthIndicator, TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;
  const memory = {
    checkHeap: jest.fn(async (key: string) => ({
      [key]: { status: "up" as const },
    })),
  };

  beforeEach(async () => {
    memory.checkHeap.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
    })
      .overrideProvider(MemoryHealthIndicator)
      .useValue(memory)
      .compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("liveness check returns status up", async () => {
    const result = await controller.liveness();
    expect(result.status).toBe("ok");
    expect(memory.checkHeap).toHaveBeenCalledWith(
      "memory_heap",
      512 * 1024 * 1024,
    );
  });

  it("readiness check returns status up", async () => {
    const result = await controller.readiness();
    expect(result.status).toBe("ok");
    expect(memory.checkHeap).toHaveBeenCalledWith(
      "memory_heap",
      512 * 1024 * 1024,
    );
  });
});
