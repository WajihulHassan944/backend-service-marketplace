
import ErrorHandler from "../middlewares/error.js";
import { User } from "../models/user.js";
import { Wallet } from "../models/wallet.js";
import stripe from "../utils/stripe.js";
import mongoose from "mongoose";

// POST /api/wallet/add-billing-method
export const addBillingMethod = async (req, res, next) => {
  try {
    const { userId, paymentMethodId } = req.body;

    const user = await User.findById(userId);
    if (!user) return next(new ErrorHandler("User not found", 404));

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) return next(new ErrorHandler("Wallet not found", 404));

    // ✅ Step 1: Create a Stripe Customer if not exists
    if (!wallet.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
      });

      wallet.stripeCustomerId = customer.id;
      await wallet.save();
    }

    // ✅ Step 2: Attach payment method to customer
    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: wallet.stripeCustomerId,
    });

    // ✅ Step 3: Set default payment method (optional but good for billing)
    await stripe.customers.update(wallet.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // ✅ Step 4: Save in MongoDB
    const isFirstCard = wallet.cards.length === 0;

    wallet.cards.push({
      stripeCardId: paymentMethod.id,
      brand: paymentMethod.card.brand,
      last4: paymentMethod.card.last4,
      expMonth: paymentMethod.card.exp_month,
      expYear: paymentMethod.card.exp_year,
      isPrimary: isFirstCard,
    });

    await wallet.save();

    return res.status(200).json({
      success: true,
      message: "Billing method added successfully.",
      card: {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year,
        isPrimary: isFirstCard,
      },
    });
  } catch (error) {
    console.error("❌ Error adding billing method:", error);
    next(error);
  }
};


// POST /api/wallet/add-funds
export const addFundsToWallet = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return next(new ErrorHandler("User ID and amount are required", 400));
    }

    const user = await User.findById(userId);
    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return next(new ErrorHandler("Wallet not found", 404));
    }

    const primaryCard = wallet.cards.find((card) => card.isPrimary);
    if (!primaryCard) {
      return next(new ErrorHandler("No primary card found. Please add a billing method first.", 400));
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      customer: wallet.stripeCustomerId,
      payment_method: primaryCard.stripeCardId,
      off_session: true,
      confirm: true,
      description: `Wallet top-up for ${user.firstName} (${user.email})`,
      metadata: {
        userId: user._id.toString(),
        email: user.email,
        purpose: "wallet_topup",
      },
    });

    if (paymentIntent.status !== "succeeded") {
      return next(new ErrorHandler("Stripe payment failed", 402));
    }

    // Update wallet balance and log transaction
    wallet.balance += amount;
    wallet.transactions.push({
      type: "credit",
      amount,
      description: "Wallet Top-Up",
    });

    await wallet.save();

    return res.status(200).json({
      success: true,
      message: "Funds added successfully to wallet.",
      wallet: {
        balance: wallet.balance,
        transactions: wallet.transactions,
      },
      stripePayment: {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        payment_method: paymentIntent.payment_method,
        receipt_url: paymentIntent.charges.data[0]?.receipt_url,
        created: paymentIntent.created,
      },
    });

  } catch (error) {
    if (error.code === "authentication_required") {
      return next(new ErrorHandler("Authentication required for card. Please re-authenticate.", 402));
    }

    console.error("❌ Error in addFundsToWallet:", error);
    next(new ErrorHandler(error.message || "Failed to add funds.", 500));
  }
};


export const initializeWalletsForAllUsers = async () => {
  try {
    const users = await User.find();

    for (const user of users) {
      const existingWallet = await Wallet.findOne({ userId: user._id });
      if (existingWallet) {
        console.log(`Wallet already exists for ${user.email}`);
        continue;
      }

      // 1. Create Stripe Customer
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName} ${user.lastName || ""}`.trim(),
      });

      // 2. Create Wallet Document
      const newWallet = new Wallet({
        userId: user._id,
        stripeCustomerId: stripeCustomer.id,
        balance: 0,
        cards: [],
        transactions: [],
      });

      await newWallet.save();
      console.log(`✅ Wallet initialized for ${user.email}`);
    }

    console.log("🎉 Wallet initialization completed for all users.");
  } catch (err) {
    console.error("❌ Error initializing wallets:", err);
  } finally {
    mongoose.disconnect();
  }
};