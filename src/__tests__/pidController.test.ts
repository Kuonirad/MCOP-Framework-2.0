// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { PIDController } from '../control';

describe('PIDController', () => {
  it('proportional term is kp·error', () => {
    const pid = new PIDController({ gains: { kp: 2, ki: 0, kd: 0 }, setpoint: 1 });
    const u = pid.update(0);
    expect(u.error).toBe(1);
    expect(u.p).toBe(2);
    expect(u.i).toBe(0);
    expect(u.d).toBe(0);
    expect(u.output).toBe(2);
    expect(u.saturated).toBe(false);
  });

  it('integral accumulates error over time', () => {
    const pid = new PIDController({ gains: { kp: 0, ki: 1, kd: 0 }, setpoint: 1 });
    expect(pid.update(0).i).toBeCloseTo(1, 9); // +1·1·dt
    expect(pid.update(0).i).toBeCloseTo(2, 9); // +1 again
    expect(pid.update(0).output).toBeCloseTo(3, 9);
  });

  it('clamps the integral accumulator (anti-windup guard #1)', () => {
    const pid = new PIDController({
      gains: { kp: 0, ki: 1, kd: 0 },
      setpoint: 1,
      integralMax: 0.5,
      integralMin: -0.5,
    });
    pid.update(0);
    pid.update(0);
    expect(pid.update(0).i).toBeCloseTo(0.5, 9); // pinned at the clamp
  });

  it('holds integration while saturated and pushing deeper (anti-windup guard #2)', () => {
    const pid = new PIDController({
      gains: { kp: 2, ki: 1, kd: 0 },
      setpoint: 1,
      outputMin: 0,
      outputMax: 1,
    });
    // Raw output 2·1 = 2 saturates to 1 every tick; error stays positive, so the
    // integral must NOT wind up.
    let last = pid.update(0);
    for (let k = 0; k < 10; k += 1) last = pid.update(0);
    expect(last.saturated).toBe(true);
    expect(last.i).toBe(0); // conditional integration prevented windup
    expect(last.output).toBe(1);
  });

  it('derivative acts on −Δmeasurement by default (no setpoint kick)', () => {
    const pid = new PIDController({ gains: { kp: 0, ki: 0, kd: 1 }, setpoint: 5 });
    expect(pid.update(0).d).toBe(0); // no history yet
    expect(pid.update(0.5).d).toBeCloseTo(-0.5, 9); // −kd·(Δmeasurement/dt)
  });

  it('derivative acts on Δerror when configured', () => {
    const pid = new PIDController({
      gains: { kp: 0, ki: 0, kd: 1 },
      setpoint: 1,
      derivativeOnMeasurement: false,
    });
    pid.update(0); // error 1
    expect(pid.update(0.25).d).toBeCloseTo(-0.25, 9); // Δerror = 0.75−1 = −0.25
  });

  it('reset clears integral and derivative history', () => {
    const pid = new PIDController({ gains: { kp: 0, ki: 1, kd: 0 }, setpoint: 1 });
    pid.update(0);
    pid.reset();
    expect(pid.update(0).i).toBeCloseTo(1, 9); // started fresh, not 2
  });

  it('honours setpoint and gain mutation', () => {
    const pid = new PIDController({ gains: { kp: 1, ki: 0, kd: 0 }, setpoint: 0 });
    pid.setSetpoint(10);
    pid.setGains({ kp: 0.5 });
    const u = pid.update(0);
    expect(pid.getSetpoint()).toBe(10);
    expect(pid.getGains().kp).toBe(0.5);
    expect(u.output).toBe(5); // 0.5 · (10 − 0)
  });
});
