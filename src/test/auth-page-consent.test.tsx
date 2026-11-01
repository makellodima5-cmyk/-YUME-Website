/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthPage } from "@/components/yume/AuthPage";

vi.mock("@/lib/telegram-mini-app", () => ({ getTelegramWebApp: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("registration consent UI", () => {
  it("requires separate policy and user-agreement choices, and legal links do not toggle checkboxes", () => {
    const onPrivacy = vi.fn();
    const onRules = vi.fn();
    render(
      <AuthPage
        mode="register"
        language="en"
        onModeChange={vi.fn()}
        onPrivacy={onPrivacy}
        onRules={onRules}
        onComplete={vi.fn()}
      />,
    );

    const privacy = screen.getByRole("checkbox", { name: "Accept the Privacy Policy" }) as HTMLInputElement;
    const terms = screen.getByRole("checkbox", { name: "Accept the Site Terms of Use" }) as HTMLInputElement;
    const submit = screen.getByRole("button", { name: "Continue with Telegram" }) as HTMLButtonElement;

    expect(privacy.checked).toBe(false);
    expect(terms.checked).toBe(false);
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "Privacy Policy" })[0]!);
    expect(onPrivacy).toHaveBeenCalledTimes(1);
    expect(privacy.checked).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Site Terms of Use" }));
    expect(onRules).toHaveBeenCalledTimes(1);
    expect(terms.checked).toBe(false);

    fireEvent.click(privacy);
    expect(submit.disabled).toBe(true);
    fireEvent.click(terms);
    expect(submit.disabled).toBe(false);
  });
  it("submits OIDC registration consent in a POST body instead of URL parameters", async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    render(
      <AuthPage
        mode="register"
        language="en"
        onModeChange={vi.fn()}
        onPrivacy={vi.fn()}
        onRules={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Accept the Privacy Policy" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Accept the Site Terms of Use" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue with Telegram" }));

    const form = document.querySelector<HTMLFormElement>('form[action="/api/telegram/oidc"]');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(form?.method.toLowerCase()).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/telegram/oidc");
    expect(new FormData(form!).get("flow")).toBe("register");
    expect(new FormData(form!).get("privacyConsent")).toBe("true");
    expect(new FormData(form!).get("termsAccepted")).toBe("true");
    expect(form?.action).not.toContain("consent");
    form?.remove();
    submit.mockRestore();
  });

});
