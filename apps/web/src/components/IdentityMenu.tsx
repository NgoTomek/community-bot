import { Check, ChevronDown, KeyRound, Laptop, Link2, Moon, RotateCcw, Sun, Trash2, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useIdentity } from "../app/identity";
import { usePresenter } from "../app/presenter";
import { useTheme, type ThemePref } from "../app/theme";
import { useData } from "../data/DataProvider";
import { Avatar } from "./Avatar";
import { CopyButton } from "./CopyButton";
import { Popover } from "./ui/Popover";

/** "You are <community>" with a switcher, the organiser-link entry, presenter mode and theme. */
export function IdentityMenu() {
  const { identities, active, addFromLink, switchTo, forget, linkFor } = useIdentity();
  const { isPresenter, enter, exit } = usePresenter();
  const { pref, setPref } = useTheme();
  const source = useData();
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = await addFromLink(link);
    setError(message);
    if (!message) setLink("");
  };

  const activeName = active?.name ?? (active ? "Unknown community" : null);
  return (
    <Popover
      label="Identity and settings"
      width={340}
      trigger={(props) => (
        <button type="button" {...props} className="btn btn-ghost h-9 min-h-9 gap-2 px-2" aria-label={activeName ? `You are ${activeName}. Switch` : "Choose who you are"}>
          {active?.communityId ? <Avatar id={active.communityId} name={activeName ?? "?"} size={26} /> : <UserRound size={18} aria-hidden />}
          <span className="max-w-[160px] truncate text-sm max-md:hidden">
            {activeName ? (
              <>
                <span className="text-muted">You are </span>
                {activeName}
              </>
            ) : (
              "Who are you?"
            )}
          </span>
          {isPresenter ? <KeyRound size={14} className="text-accent" aria-label="Presenter mode" /> : null}
          <ChevronDown size={14} className="text-faint" aria-hidden />
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-4">
          {identities.length ? (
            <div>
              <p className="eyebrow mb-2">You are</p>
              <ul className="-mx-2 space-y-0.5">
                {identities.map((identity) => {
                  const isActive = identity.inbox === active?.inbox;
                  const name = identity.name ?? "Unknown community";
                  return (
                    <li key={identity.inbox} className="group flex items-center gap-1">
                      <button
                        type="button"
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sunken ${isActive ? "font-medium" : ""}`}
                        onClick={() => {
                          switchTo(identity.inbox);
                          close();
                        }}
                        aria-current={isActive ? "true" : undefined}
                      >
                        {identity.communityId ? <Avatar id={identity.communityId} name={name} size={22} /> : <UserRound size={18} aria-hidden />}
                        <span className="truncate">{name}</span>
                        {isActive ? <Check size={14} className="ml-auto shrink-0 text-accent" aria-hidden /> : null}
                      </button>
                      <button type="button" className="btn btn-ghost btn-icon btn-sm text-faint" onClick={() => forget(identity.inbox)} aria-label={`Forget the organiser link for ${name}`}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {active ? (
                <CopyButton text={linkFor(active)} label="Copy my organiser link" className="btn btn-sm mt-2 w-full" />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">No organiser link saved in this browser yet. Add your community, or paste the link you were sent.</p>
          )}

          <form onSubmit={submit} className="space-y-2 border-t border-line pt-4">
            <label htmlFor="organiser-link" className="eyebrow flex items-center gap-1.5">
              <Link2 size={13} aria-hidden /> Organiser link
            </label>
            <div className="flex gap-2">
              <input
                id="organiser-link"
                className="input h-9 min-h-9 text-sm"
                placeholder="Paste a link with ?inbox="
                value={link}
                onChange={(e) => setLink(e.target.value)}
                aria-invalid={error ? true : undefined}
              />
              <button type="submit" className="btn btn-sm h-9" disabled={!link.trim()}>
                Save
              </button>
            </div>
            {error ? <p className="text-sm text-bad">{error}</p> : null}
          </form>

          <div className="space-y-2 border-t border-line pt-4">
            <p className="eyebrow">Presenter mode</p>
            {isPresenter ? (
              <button type="button" className="btn btn-sm w-full" onClick={exit}>
                Exit presenter mode
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm w-full"
                onClick={() => {
                  close();
                  enter();
                }}
              >
                <KeyRound size={14} aria-hidden /> Enter with the passcode
              </button>
            )}
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <p className="eyebrow">Theme</p>
            <div className="segmented" role="radiogroup" aria-label="Theme">
              {(
                [
                  ["system", "Auto", Laptop],
                  ["light", "Light", Sun],
                  ["dark", "Dark", Moon],
                ] as [ThemePref, string, typeof Sun][]
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={pref === value}
                  className="flex items-center justify-center gap-1.5 px-2"
                  onClick={() => setPref(value)}
                >
                  <Icon size={14} aria-hidden /> {label}
                </button>
              ))}
            </div>
          </div>

          {source.reset ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm w-full text-muted"
              onClick={() => {
                source.reset?.();
                close();
              }}
            >
              <RotateCcw size={14} aria-hidden /> Reset sample data
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}
