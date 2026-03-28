import {
  Entity,
  BaseEntity,
  Describe,
  Component,
  Hook,
  Init,
} from "@interactkit/sdk";
import { Worker } from "./worker.js";

@Entity()
export class Agent extends BaseEntity {
  @Describe() describe() {
    return "Agent";
  }
  @Component() private worker!: Remote<Worker>;

  @Hook(Init.Runner())
  async onInit() {
    // === 1. Serializable ===
    console.log("[29] === Serializable ===");
    await this.worker.store({ text: "hello" });
    await this.worker.store({ text: "world" });
    const after = await this.worker.getData();
    console.log(
      `[29] after store: count=${after.count}, items=${JSON.stringify(after.items)}`,
    );

    // === 2. Function proxy ===
    console.log("[29] === Function proxy ===");
    try {
      const adder = await this.worker.getAdder();
      const sum = await adder(3, 4);
      console.log(`[29] function proxy: ${sum === 7 ? "PASS" : "FAIL"}`);
    } catch (e: any) {
      console.log(`[29] function proxy: FAIL (${e.message})`);
    }

    // === 3. Class instance proxy ===
    console.log("[29] === Class instance proxy ===");
    try {
      const counter: any = await this.worker.getCounter();
      const v1 = await counter.increment();
      const v2 = await counter.increment();
      const v3 = await counter.get();
      console.log(
        `[29] class proxy: ${v1 === 1 && v2 === 2 && v3 === 2 ? "PASS" : "FAIL"}`,
      );
    } catch (e: any) {
      console.log(`[29] class proxy: FAIL (${e.message})`);
    }

    // === 4. Recursive proxy ===
    console.log("[29] === Recursive proxy ===");
    try {
      const nested: any = await this.worker.getNested();
      const len1 = await nested.add("one");
      const len2 = await nested.add("two");
      const deepCounter = await nested.getCounter();
      await deepCounter.increment();
      await deepCounter.increment();
      const deepVal = await deepCounter.get();
      console.log(
        `[29] recursive proxy: ${len1 === 1 && len2 === 2 && deepVal === 2 ? "PASS" : "FAIL"}`,
      );
    } catch (e: any) {
      console.log(`[29] recursive proxy: FAIL (${e.message})`);
    }

    // === 5. Curried function ===
    console.log("[29] === Curried function ===");
    try {
      const maker: any = await this.worker.getCallbackMaker();
      const prefixed = await maker("hello");
      const result = await prefixed("world");
      console.log(
        `[29] curried proxy: ${result === "hello:world" ? "PASS" : "FAIL"}`,
      );
    } catch (e: any) {
      console.log(`[29] curried proxy: FAIL (${e.message})`);
    }

    // === 6. Promise.all ===
    console.log("[29] === Promise.all ===");
    try {
      const [d1, d2, d3] = await Promise.all([
        this.worker.getPid(),
        this.worker.getPid(),
        this.worker.getPid(),
      ]);
      console.log(
        `[29] promise.all: ${d1 === d2 && d2 === d3 ? "PASS" : "FAIL"}`,
      );
    } catch (e: any) {
      console.log(`[29] promise.all: FAIL (${e.message})`);
    }

    console.log("[29] DONE");
    setTimeout(() => process.exit(0), 200);
  }
}
