import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthPage } from "@/components/yume/AuthPage";

function mockAuthStatus(payload: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  }));
}

describe("AuthPage registration gating", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it("keeps registration unavailable until a provider is configured and verified", async () => {
    mockAuthStatus({
      providers: { vk: false, yandex: false },
      connectedProvider: null,
    });

    render(<AuthPage mode="register" language="ru" onModeChange={vi.fn()} onPrivacy={vi.fn()} onAgreement={vi.fn()} />);

    const registerButton = screen.getByRole("button", { name: "Зарегистрироваться" });
    await waitFor(() => expect(screen.getByRole("button", { name: /Продолжить через VK ID/ })).toBeDisabled());
    expect(registerButton).toBeDisabled();
  });

  it("requires date of birth and the privacy checkbox even after provider authentication", async () => {
    mockAuthStatus({
      providers: { vk: true, yandex: true },
      connectedProvider: "vk",
      connectedProviderLabel: "VK ID",
    });

    render(<AuthPage mode="register" language="ru" onModeChange={vi.fn()} onPrivacy={vi.fn()} />);

    const registerButton = screen.getByRole("button", { name: "Зарегистрироваться" });
    await waitFor(() => expect(screen.getByText(/Авторизация подтверждена через VK ID/)).toBeInTheDocument());
    expect(registerButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("День"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Месяц"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Год"), { target: { value: String(new Date().getFullYear() - 20) } });
    expect(registerButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(registerButton).toBeEnabled());
  });


  it("restores the date of birth and privacy checkbox after provider redirect", async () => {
    const birthYear = String(new Date().getFullYear() - 20);
    window.sessionStorage.setItem("yume-registration-draft-v1", JSON.stringify({
      day: "10",
      month: "1",
      year: birthYear,
      consentAccepted: true,
      savedAt: Date.now(),
    }));
    mockAuthStatus({
      providers: { vk: true, yandex: true },
      connectedProvider: "vk",
      connectedProviderLabel: "VK ID",
    });

    render(<AuthPage mode="register" language="ru" onModeChange={vi.fn()} onPrivacy={vi.fn()} onAgreement={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Зарегистрироваться" })).toBeEnabled());
    expect(screen.getByLabelText("День")).toHaveValue("10");
    expect(screen.getByLabelText("Месяц")).toHaveValue("1");
    expect(screen.getByLabelText("Год")).toHaveValue(birthYear);
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(window.sessionStorage.getItem("yume-registration-draft-v1")).toBeNull();
  });
});
