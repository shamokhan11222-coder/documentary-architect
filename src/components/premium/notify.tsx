import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, Info, Loader2 } from "lucide-react";

interface NotifyOpts {
  description?: string;
  duration?: number;
}

/**
 * Premium notification helpers built on sonner. The <Toaster /> is already
 * mounted at the app root, so import { notify } and call it anywhere.
 */
export const notify = {
  success: (title: string, opts?: NotifyOpts) =>
    toast.success(title, { icon: <CheckCircle2 className="size-4 text-emerald-500" />, ...opts }),
  error: (title: string, opts?: NotifyOpts) =>
    toast.error(title, { icon: <XCircle className="size-4 text-destructive" />, ...opts }),
  warning: (title: string, opts?: NotifyOpts) =>
    toast.warning(title, { icon: <AlertTriangle className="size-4 text-amber-500" />, ...opts }),
  info: (title: string, opts?: NotifyOpts) =>
    toast(title, { icon: <Info className="size-4 text-brand" />, ...opts }),
  loading: (title: string, opts?: NotifyOpts) =>
    toast.loading(title, { icon: <Loader2 className="size-4 animate-spin text-brand" />, ...opts }),
  promise: toast.promise,
  dismiss: toast.dismiss,
};
