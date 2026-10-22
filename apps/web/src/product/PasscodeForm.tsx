import { useState, type FormEvent } from "react";
import { usePasscode } from "./session";
import { ErrorBanner } from "./ui";

export function PasscodeForm({ reason }: { reason: string }) {
  const { notice, save } = usePasscode();
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) {
      setLocalError("Enter the passcode.");
      return;
    }
    setLocalError(null);
    save(value);
  }

  return (
    <form className="stack clipping" onSubmit={onSubmit}>
      <h2>Passcode</h2>
      <p>{reason}</p>
      <ErrorBanner message={notice || localError} />
      <label className="block-label">
        Organiser passcode
        <input
          className="field"
          type="password"
          name="passcode"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <p className="hint">Demo passcode: community</p>
      <button className="btn-signal" type="submit">
        Continue
      </button>
    </form>
  );
}
