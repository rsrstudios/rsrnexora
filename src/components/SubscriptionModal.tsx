import React, { useState, useEffect } from "react";
import {
  X,
  Check,
  Zap,
  Crown,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Clock,
  ArrowRight,
  Info,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface PlanLimits {
  messages: number;
  images: number;
  searches: number;
  files: number;
}

interface PlanMetadata {
  id: "free" | "plus" | "pro" | "ultra";
  name: string;
  priceInr: number;
  priceDisplay: string;
  billingPeriod: string;
  limits: PlanLimits;
  features: string[];
  highlight?: boolean;
}

interface SubscriptionData {
  plan: "free" | "plus" | "pro" | "ultra" | "guest";
  status: string;
  isGuest: boolean;
  limits: PlanLimits;
  subscription: {
    subscriptionId: string;
    plan: "free" | "plus" | "pro" | "ultra";
    status: string;
    currentPeriodStart: number;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
    provider: string;
  } | null;
  paymentConfig: {
    provider: string;
    isConfigured: boolean;
    currency: string;
  };
}

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanMetadata[]>([]);
  const [subData, setSubData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchDetails = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      // Fetch public plans
      const plansRes = await fetch("/api/subscription/plans");
      if (plansRes.ok) {
        const pData = await plansRes.json();
        setPlans(pData.plans || []);
      }

      // Fetch user subscription details
      const subRes = await fetch("/api/subscription");
      if (subRes.ok) {
        const sData = await subRes.json();
        setSubData(sData);
      }
    } catch {
      setErrorMessage("Failed to load subscription information.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDetails();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentPlan = subData?.plan || (user?.isGuest ? "guest" : "free");
  const isGuest = Boolean(user?.isGuest || subData?.isGuest);
  const isConfigured = subData?.paymentConfig?.isConfigured ?? false;

  const handleCheckout = async (planId: "plus" | "pro" | "ultra") => {
    if (isGuest) {
      setErrorMessage("Guest sessions cannot purchase subscriptions. Please create an account or sign in first.");
      return;
    }

    if (!isConfigured) {
      setErrorMessage("Paid subscriptions are currently unavailable. Payment provider credentials are not yet configured on the server.");
      return;
    }

    try {
      setActionLoading(planId);
      setErrorMessage(null);
      setSuccessMessage(null);

      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to start checkout");
      }

      if (data.checkout?.checkoutUrl) {
        window.location.href = data.checkout.checkoutUrl;
      } else {
        setSuccessMessage(`Checkout created for ${planId.toUpperCase()} (${data.checkout.orderId || data.checkout.subscriptionId}).`);
        await fetchDetails();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process checkout request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your subscription? You will keep your benefits until the end of the billing period.")) {
      return;
    }

    try {
      setActionLoading("cancel");
      setErrorMessage(null);

      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to cancel subscription");
      }

      setSuccessMessage(data.message || "Subscription cancellation scheduled.");
      await fetchDetails();
      window.dispatchEvent(new CustomEvent("rsr:refresh-usage"));
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to cancel subscription.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div
        id="subscription-modal-dialog"
        className="relative w-full max-w-5xl my-8 bg-white dark:bg-[#0E131F] border border-neutral-200 dark:border-neutral-800 rounded-3xl shadow-2xl overflow-hidden text-neutral-900 dark:text-neutral-100 flex flex-col"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-neutral-200 dark:border-neutral-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">RSR Nexora Plans & Subscriptions</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Transparent daily allowances powered by the RSR Daily Limits System
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Plan & Guest Banner */}
        <div className="px-6 pt-4 pb-2">
          {isGuest ? (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>You are currently in <strong>Guest Mode</strong>. Create an account to unlock higher tiers or subscribe.</span>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-neutral-100/80 dark:bg-neutral-900/60 border border-neutral-200/80 dark:border-neutral-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>
                  Current Active Tier: <strong className="uppercase text-indigo-600 dark:text-indigo-400">{currentPlan}</strong>
                  {subData?.subscription?.cancelAtPeriodEnd && (
                    <span className="ml-2 text-amber-600 dark:text-amber-400">
                      (Cancels on {new Date(subData.subscription.currentPeriodEnd).toLocaleDateString()})
                    </span>
                  )}
                </span>
              </div>
              {subData?.subscription && subData.subscription.status === "active" && !subData.subscription.cancelAtPeriodEnd && (
                <button
                  type="button"
                  onClick={handleCancelSubscription}
                  disabled={actionLoading === "cancel"}
                  className="text-neutral-500 hover:text-red-500 transition-colors cursor-pointer text-xs underline"
                >
                  {actionLoading === "cancel" ? "Cancelling..." : "Cancel subscription"}
                </button>
              )}
            </div>
          )}

          {/* Configuration alert if payment keys are not set */}
          {!isConfigured && (
            <div className="mt-3 p-3 rounded-2xl bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700/50 text-neutral-600 dark:text-neutral-400 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-neutral-400 shrink-0" />
              <span>
                Payment provider is in test/unconfigured mode. Paid subscription checkout is securely disabled until credentials are provided in <code>.env</code>.
              </span>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Pricing Cards Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((p) => {
            const isCurrent = currentPlan === p.id;
            const isHighlighted = p.highlight;

            return (
              <div
                key={p.id}
                className={`relative rounded-2xl p-5 border flex flex-col justify-between transition-all ${
                  isHighlighted
                    ? "border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 shadow-lg shadow-indigo-500/5"
                    : isCurrent
                    ? "border-emerald-500/50 bg-emerald-50/10 dark:bg-emerald-950/10"
                    : "border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30"
                }`}
              >
                {/* Popular Badge */}
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold tracking-wide uppercase shadow-sm">
                    Most Popular
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base">{p.name}</h3>
                    {isCurrent && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                        Current
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-black">{p.priceDisplay}</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{p.billingPeriod}</span>
                  </div>

                  {/* Limits Summary */}
                  <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800/80 space-y-1.5 text-xs">
                    <div className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
                      Daily Allowances
                    </div>
                    <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                      <span>Messages</span>
                      <span className="font-semibold">{p.limits.messages}/day</span>
                    </div>
                    <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                      <span>Images</span>
                      <span className="font-semibold">{p.limits.images}/day</span>
                    </div>
                    <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                      <span>Searches</span>
                      <span className="font-semibold">{p.limits.searches}/day</span>
                    </div>
                    <div className="flex items-center justify-between text-neutral-700 dark:text-neutral-300">
                      <span>Files</span>
                      <span className="font-semibold">{p.limits.files}/day</span>
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800/80 space-y-1.5">
                    {p.features.slice(0, 4).map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                        <Check className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Action */}
                <div className="mt-6 pt-2">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2 px-3 rounded-xl bg-neutral-200 dark:bg-neutral-800 text-neutral-500 text-xs font-semibold cursor-not-allowed text-center"
                    >
                      Active Plan
                    </button>
                  ) : p.id === "free" ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-500 text-xs font-semibold cursor-default text-center"
                    >
                      Default Tier
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCheckout(p.id as "plus" | "pro" | "ultra")}
                      disabled={!isConfigured || isGuest || actionLoading === p.id}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        !isConfigured || isGuest
                          ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
                          : isHighlighted
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20"
                          : "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90"
                      }`}
                    >
                      {actionLoading === p.id ? (
                        "Processing..."
                      ) : !isConfigured ? (
                        "Checkout Offline"
                      ) : (
                        <>
                          <span>Upgrade</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="px-6 py-3 bg-neutral-50 dark:bg-neutral-900/50 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Daily limits reset every day at 00:00 UTC.</span>
          </div>
          <span>Billed securely in INR. Cancel anytime.</span>
        </div>
      </div>
    </div>
  );
};
