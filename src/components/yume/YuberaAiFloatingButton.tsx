import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import { useYumePreferences } from "@/data/preferences";

export function YuberaAiFloatingButton() {
  const { language } = useYumePreferences();
  const location = useLocation();
  const [entitled, setEntitled] = useState(false);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetch("/api/yubera/ai/access", { credentials: "same-origin", cache: "no-store" });
        if (!cancelled) setEntitled(response.ok);
      } catch {
        if (!cancelled) setEntitled(false);
      } finally {
        if (!cancelled) setChecked(true);
      }
    };
    void check();
    const onAuthChanged = () => void check();
    window.addEventListener("yume-auth-state-changed", onAuthChanged);
    window.addEventListener("focus", onAuthChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("yume-auth-state-changed", onAuthChanged);
      window.removeEventListener("focus", onAuthChanged);
    };
  }, []);
  if (!checked || !entitled || location.pathname === "/ai") return null;
  return (
    <Link to="/ai" aria-label={language === "ru" ? "Открыть YUBERA AI" : "Open YUBERA AI"} title="YUBERA AI" className="yubera-ai-fab">
      <span className="relative grid place-items-center"><MessageCircle className="h-7 w-7" /><span className="absolute top-[9px] text-[9px] font-black leading-none tracking-tight">AI</span></span>
    </Link>
  );
}
