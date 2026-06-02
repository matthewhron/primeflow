/**
 * Fraud Detection Demo
 * Demonstrates fraud detection and risk scoring
 */

import {
  createFraudDetector,
  type FraudContext,
  type PaymentIntent,
} from "../src/index.js";

async function main() {
  console.log("🛡️ Fraud Detection Demo\n");

  // Create fraud detector with custom config
  const detector = createFraudDetector({
    thresholds: {
      review: 50,
      block: 80,
    },
    defaultRulesEnabled: true,
    onHighRisk: (assessment, context) => {
      console.log(`\n⚠️ HIGH RISK ALERT!`);
      console.log(`  Intent: ${context.intent.id}`);
      console.log(`  Score: ${assessment.score}`);
      console.log(`  Action: ${assessment.action}`);
    },
  });

  // Add custom rule
  detector.addRule({
    name: "test_email_domain",
    weight: 0.5,
    evaluate: async (ctx) => {
      if (ctx.email?.includes("@test.com")) {
        return {
          name: "test_email_domain",
          score: 30,
          level: "medium",
          reason: "Test email domain detected",
        };
      }
      return null;
    },
  });

  console.log("📋 Active Rules:");
  for (const rule of detector.getRules()) {
    console.log(`  - ${rule.name} (weight: ${rule.weight}, enabled: ${rule.enabled})`);
  }

  // Test scenarios
  const scenarios: { name: string; context: FraudContext }[] = [
    {
      name: "Normal transaction",
      context: {
        intent: {
          id: "pi_normal_001",
          amount: 5000,
          currency: "USD",
          paymentMethod: "card",
        },
        ip: "192.168.1.100",
        email: "john@company.com",
        accountAgeDays: 365,
        isNewCustomer: false,
        previousPayments: 50,
        previousChargebacks: 0,
      },
    },
    {
      name: "New customer, large amount",
      context: {
        intent: {
          id: "pi_newcustomer_001",
          amount: 15000,
          currency: "USD",
          paymentMethod: "card",
        },
        ip: "203.45.67.89",
        email: "newuser@gmail.com",
        accountAgeDays: 2,
        isNewCustomer: true,
        previousPayments: 0,
        previousChargebacks: 0,
      },
    },
    {
      name: "Disposable email",
      context: {
        intent: {
          id: "pi_disposable_001",
          amount: 2500,
          currency: "USD",
          paymentMethod: "card",
        },
        ip: "10.0.0.1",
        email: "temp123@tempmail.com",
        accountAgeDays: 1,
        isNewCustomer: true,
        previousPayments: 0,
        previousChargebacks: 0,
      },
    },
    {
      name: "Customer with chargebacks",
      context: {
        intent: {
          id: "pi_chargeback_001",
          amount: 3000,
          currency: "USD",
          paymentMethod: "card",
        },
        ip: "172.16.0.50",
        email: "badactor@email.com",
        accountAgeDays: 90,
        isNewCustomer: false,
        previousPayments: 10,
        previousChargebacks: 3,
      },
    },
    {
      name: "High-risk currency",
      context: {
        intent: {
          id: "pi_currency_001",
          amount: 50000,
          currency: "RUB",
          paymentMethod: "card",
        },
        ip: "95.108.213.45",
        email: "user@domain.ru",
        accountAgeDays: 30,
        isNewCustomer: false,
        previousPayments: 5,
        previousChargebacks: 0,
      },
    },
    {
      name: "Very round amount (suspicious)",
      context: {
        intent: {
          id: "pi_round_001",
          amount: 10000,
          currency: "USD",
          paymentMethod: "card",
        },
        ip: "8.8.8.8",
        email: "suspicious@test.com",
        accountAgeDays: 5,
        isNewCustomer: true,
        previousPayments: 1,
        previousChargebacks: 0,
      },
    },
  ];

  console.log("\n🔍 Running Fraud Assessments:\n");
  console.log("=".repeat(80));

  for (const scenario of scenarios) {
    console.log(`\n📌 Scenario: ${scenario.name}`);
    console.log(`   Amount: $${(scenario.context.intent.amount / 100).toFixed(2)} ${scenario.context.intent.currency}`);
    console.log(`   Email: ${scenario.context.email}`);
    console.log(`   Account Age: ${scenario.context.accountAgeDays} days`);

    const assessment = await detector.assess(scenario.context);

    console.log(`\n   🎯 Risk Assessment:`);
    console.log(`   Score: ${assessment.score}/100`);
    console.log(`   Level: ${assessment.level.toUpperCase()}`);
    console.log(`   Action: ${assessment.action.toUpperCase()}`);

    if (assessment.signals.length > 0) {
      console.log(`\n   ⚡ Triggered Signals:`);
      for (const signal of assessment.signals) {
        console.log(`   - ${signal.name}: ${signal.score.toFixed(0)} (${signal.level})`);
        console.log(`     Reason: ${signal.reason}`);
      }
    } else {
      console.log(`\n   ✅ No risk signals triggered`);
    }

    console.log("\n" + "-".repeat(80));
  }

  // Simulate velocity attack
  console.log("\n\n🚨 Simulating Velocity Attack...\n");

  const attackerIP = "123.45.67.89";
  const attackerEmail = "attacker@gmail.com";

  for (let i = 0; i < 15; i++) {
    const context: FraudContext = {
      intent: {
        id: `pi_velocity_${i}`,
        amount: 100 + i * 10,
        currency: "USD",
        paymentMethod: "card",
      },
      ip: attackerIP,
      email: attackerEmail,
      accountAgeDays: 1,
      isNewCustomer: true,
    };

    const assessment = await detector.assess(context);
    
    if (i % 5 === 0 || assessment.action === "block") {
      console.log(`Payment ${i + 1}: Score=${assessment.score}, Action=${assessment.action}`);
    }

    if (assessment.action === "block") {
      console.log(`\n🛑 BLOCKED after ${i + 1} attempts!`);
      console.log("   Velocity protection triggered.");
      break;
    }
  }

  // Quick check usage
  console.log("\n\n⚡ Quick Check Example:");
  const quickContext: FraudContext = {
    intent: {
      id: "pi_quick_001",
      amount: 500,
      currency: "USD",
      paymentMethod: "card",
    },
    ip: "1.2.3.4",
    email: "normal@email.com",
  };

  const canProceed = await detector.quickCheck(quickContext);
  console.log(`   Can proceed: ${canProceed ? "✅ YES" : "❌ NO"}`);

  console.log("\n✅ Fraud detection demo complete!");
}

main().catch(console.error);
