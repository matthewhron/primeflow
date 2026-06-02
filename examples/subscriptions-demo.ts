/**
 * Subscriptions Demo
 * Demonstrates recurring payment management
 */

import {
  createClient,
  createSubscriptionManager,
  type SubscriptionPlan,
  type PrimeFlowConfig,
} from "../src/index.js";

// Mock client for demo
const mockConfig: PrimeFlowConfig = {
  layer403: {
    apiKey: "demo_key",
    secretKey: "demo_secret",
    baseUrl: "https://api.layer403.com",
  },
};

async function main() {
  console.log("🔄 Subscription Management Demo\n");

  // Create client (mock for demo)
  const client = createClient(mockConfig);

  // Create subscription manager
  const subscriptions = createSubscriptionManager(client, {
    maxRetryAttempts: 4,
    retryIntervalDays: 3,
    gracePeriodDays: 14,
    onEvent: async (event) => {
      console.log(`📬 Event: ${event.type}`);
      console.log(`   Subscription: ${event.subscriptionId}`);
      if (event.data) {
        console.log(`   Data: ${JSON.stringify(event.data)}`);
      }
    },
  });

  // Register subscription plans
  console.log("📋 Registering Plans...\n");

  const basicPlan: SubscriptionPlan = {
    id: "plan_basic",
    name: "Basic Plan",
    amount: 999, // $9.99
    currency: "USD",
    interval: "monthly",
    trialDays: 14,
    metadata: { features: ["feature1", "feature2"] },
  };

  const proPlan: SubscriptionPlan = {
    id: "plan_pro",
    name: "Pro Plan",
    amount: 2999, // $29.99
    currency: "USD",
    interval: "monthly",
    trialDays: 7,
    metadata: { features: ["feature1", "feature2", "feature3", "priority_support"] },
  };

  const enterprisePlan: SubscriptionPlan = {
    id: "plan_enterprise",
    name: "Enterprise Plan",
    amount: 9999, // $99.99
    currency: "USD",
    interval: "monthly",
    maxCycles: 12, // 1 year commitment
    metadata: { features: ["all_features", "dedicated_support", "custom_integrations"] },
  };

  subscriptions.registerPlan(basicPlan);
  subscriptions.registerPlan(proPlan);
  subscriptions.registerPlan(enterprisePlan);

  console.log("Available Plans:");
  for (const plan of subscriptions.getPlans()) {
    console.log(`  📦 ${plan.name} - $${(plan.amount / 100).toFixed(2)}/${plan.interval}`);
    if (plan.trialDays) {
      console.log(`     Trial: ${plan.trialDays} days`);
    }
  }

  // Create subscriptions
  console.log("\n👤 Creating Subscriptions...\n");

  // Customer 1 - Basic with trial
  const sub1 = await subscriptions.create("customer_001", "plan_basic");
  console.log(`Created subscription for Customer 001:`);
  console.log(`  ID: ${sub1.id}`);
  console.log(`  Status: ${sub1.status}`);
  console.log(`  Trial ends: ${sub1.nextBillingDate}`);

  // Customer 2 - Pro, skip trial
  const sub2 = await subscriptions.create("customer_002", "plan_pro", {
    skipTrial: true,
    metadata: { referral: "campaign_2024" },
  });
  console.log(`\nCreated subscription for Customer 002:`);
  console.log(`  ID: ${sub2.id}`);
  console.log(`  Status: ${sub2.status}`);
  console.log(`  Next billing: ${sub2.nextBillingDate}`);

  // Get customer subscriptions
  console.log("\n📋 Customer 001 Subscriptions:");
  const customerSubs = subscriptions.getByCustomer("customer_001");
  for (const sub of customerSubs) {
    console.log(`  ${sub.id}: ${sub.status} (Plan: ${sub.planId})`);
  }

  // Pause subscription
  console.log("\n⏸️ Pausing subscription...");
  const pausedSub = await subscriptions.pause(sub1.id);
  console.log(`  Status: ${pausedSub.status}`);
  console.log(`  Paused at: ${pausedSub.pausedAt}`);

  // Resume subscription
  console.log("\n▶️ Resuming subscription...");
  const resumedSub = await subscriptions.resume(sub1.id);
  console.log(`  Status: ${resumedSub.status}`);
  console.log(`  Next billing: ${resumedSub.nextBillingDate}`);

  // Change plan
  console.log("\n🔄 Upgrading Customer 001 to Pro...");
  const upgradedSub = await subscriptions.changePlan(sub1.id, "plan_pro");
  console.log(`  New plan: ${upgradedSub.planId}`);
  console.log(`  Period end: ${upgradedSub.currentPeriodEnd}`);

  // Cancel subscription (at period end)
  console.log("\n🚫 Canceling subscription (at period end)...");
  const canceledSub = await subscriptions.cancel(sub2.id, {
    reason: "Customer requested cancellation",
  });
  console.log(`  Status: ${canceledSub.status}`);
  console.log(`  Cancels at: ${canceledSub.canceledAt}`);
  console.log(`  Reason: ${canceledSub.cancelReason}`);

  // Show subscription details
  console.log("\n📊 Final Subscription States:\n");
  
  const allSubs = [
    ...subscriptions.getByCustomer("customer_001"),
    ...subscriptions.getByCustomer("customer_002"),
  ];

  for (const sub of allSubs) {
    console.log(`Subscription ${sub.id}:`);
    console.log(`  Customer: ${sub.customerId}`);
    console.log(`  Plan: ${sub.planId}`);
    console.log(`  Status: ${sub.status}`);
    console.log(`  Created: ${sub.createdAt}`);
    console.log(`  Current Period: ${sub.currentPeriodStart} - ${sub.currentPeriodEnd}`);
    console.log(`  Cycles: ${sub.currentCycle}`);
    console.log(`  Total Paid: $${(sub.totalPaid / 100).toFixed(2)}`);
    console.log();
  }

  console.log("✅ Subscription demo complete!");
}

main().catch(console.error);
