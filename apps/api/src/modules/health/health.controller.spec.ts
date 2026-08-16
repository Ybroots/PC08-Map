import { Test, TestingModule } from "@nestjs/testing";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("liveness check returns status up", async () => {
    const result = await controller.liveness();
    expect(result.status).toBe("ok");
  });

  it("readiness check returns status up", async () => {
    const result = await controller.readiness();
    expect(result.status).toBe("ok");
  });
});
