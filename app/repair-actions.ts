"use server";
import { authorize } from "../lib/auth";
import { latest } from "../lib/records";
import {
  approveRepair,
  latestRepair,
  proposeRepair,
  repairReceipt,
  verifyRepair,
} from "../lib/checkout-repair";

async function repairAction<T>(operation: () => Promise<T>) {
  try {
    await authorize();
    return { value: await operation() };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Unable to verify the repair.",
    };
  }
}

export async function previewCheckoutRepair() {
  return repairAction(() => proposeRepair(latest().evidence ?? {}));
}

export async function openCheckoutRepair(id: string) {
  return repairAction(async () => {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
      throw new Error("Invalid proposal.");
    const previous = repairReceipt(id);
    if (previous) return previous;
    const current = await proposeRepair(latest().evidence ?? {});
    if (current.id !== id)
      throw new Error("The repair changed. Review the new preview.");
    return approveRepair(current);
  });
}

export async function checkoutRepairStatus() {
  return repairAction(async () => {
    const receipt = latestRepair();
    return receipt
      ? { receipt, verification: await verifyRepair(receipt) }
      : null;
  });
}
