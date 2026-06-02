/**
 * Analytics Demo
 * Demonstrates analytics and metrics collection
 */

import {
  createClient,
  createAnalytics,
  type PaymentMetric,
  type PrimeFlowConfig,
} from "../src/index.js";

async function main() {
  // Create analytics instance
  const analytics = createAnalytics({
    maxMetrics: 10000,
    aggregateIntervalMs: 60000,
    verbose: true,
    onPersist: async (metrics) => {
      console.log(`📊 Persisting ${metrics.length} metrics...`);
      // In production: save to database
    },
  });

  // Simulate some payment metrics
  const regions = ["eu-west", "us-east", "ap-south", "latam"];
  const routers = ["stripe-eu", "adyen-us", "razorpay-in", "mercadopago-br"];
  const currencies = ["USD", "EUR", "GBP", "BRL"];

  console.log("🎲 Generating sample metrics...\n");

  // Generate 100 sample payments
  for (let i = 0; i < 100; i++) {
    const region = regions[Math.floor(Math.random() * regions.length)];
    const router = routers[Math.floor(Math.random() * routers.length)];
    const currency = currencies[Math.floor(Math.random() * currencies.length)];
    const success = Math.random() > 0.15; // 85% success rate

    const metric: PaymentMetric = {
      intentId: `pi_${Date.now()}_${i}`,
      region,
      routerId: router,
      amount: Math.floor(Math.random() * 10000) + 100,
      currency,
      status: success ? "succeeded" : "failed",
      latencyMs: Math.floor(Math.random() * 2000) + 200,
      timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      attempts: success ? 1 : Math.floor(Math.random() * 3) + 1,
      error: success ? undefined : "PAYMENT_DECLINED",
    };

    analytics.recordPayment(metric);
  }

  // Get snapshot
  console.log("📈 Analytics Snapshot (Last 24h):\n");
  const snapshot = analytics.getSnapshot(24 * 60 * 60 * 1000);

  console.log(`  Total Payments: ${snapshot.totalPayments}`);
  console.log(`  Successful: ${snapshot.successfulPayments}`);
  console.log(`  Failed: ${snapshot.failedPayments}`);
  console.log(`  Success Rate: ${snapshot.overallSuccessRate.toFixed(1)}%`);
  console.log(`  Avg Latency: ${snapshot.avgLatencyMs}ms`);

  console.log("\n📊 Volume by Currency:");
  for (const [currency, amount] of Object.entries(snapshot.totalVolume)) {
    console.log(`  ${currency}: ${amount.toLocaleString()}`);
  }

  // Region stats
  console.log("\n🌍 Region Statistics:");
  for (const region of snapshot.regionStats) {
    console.log(`  ${region.region}:`);
    console.log(`    Payments: ${region.totalPayments}`);
    console.log(`    Success Rate: ${region.successRate.toFixed(1)}%`);
    console.log(`    Avg Latency: ${region.avgLatencyMs}ms`);
    console.log(`    Volume: ${region.totalVolume.toLocaleString()}`);
  }

  // Router stats
  console.log("\n🔌 Router Statistics:");
  for (const router of snapshot.routerStats) {
    console.log(`  ${router.routerId}: ${router.successRate.toFixed(1)}% success (${router.totalPayments} payments)`);
  }

  // Best performing regions
  console.log("\n🏆 Best Performing Regions:");
  const bestRegions = analytics.getBestRegions(3);
  bestRegions.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.region} - ${r.successRate.toFixed(1)}% success, ${r.avgLatencyMs}ms latency`);
  });

  // Error breakdown
  console.log("\n❌ Error Breakdown:");
  const errors = analytics.getErrorBreakdown();
  for (const [error, count] of Object.entries(errors)) {
    console.log(`  ${error}: ${count} occurrences`);
  }

  // Time series
  console.log("\n📉 Hourly Success Rate (last 24h):");
  const timeSeries = analytics.getTimeSeries("success_rate", 3600000, 24 * 60 * 60 * 1000);
  timeSeries.slice(-5).forEach((point) => {
    const hour = new Date(point.timestamp).toLocaleTimeString();
    console.log(`  ${hour}: ${point.value.toFixed(1)}%`);
  });

  // Export metrics
  console.log("\n💾 Exporting metrics...");
  const exported = analytics.exportMetrics();
  console.log(`  Payments: ${exported.payments.length}`);
  console.log(`  Refunds: ${exported.refunds.length}`);

  // Cleanup
  analytics.destroy();
  console.log("\n✅ Analytics demo complete!");
}

main().catch(console.error);
