import { communityColor, initials } from "../lib/color";

/** Initials on the community's stable colour. Decorative: the name is always shown nearby. */
export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: communityColor(id), fontSize: Math.round(size * 0.38), letterSpacing: "0.02em" }}
      title={name}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ items, size = 24, max = 4 }: { items: { id: string; name: string }[]; size?: number; max?: number }) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  return (
    <span className="inline-flex items-center" aria-label={items.map((i) => i.name).join(", ")} role="img">
      {shown.map((item, i) => (
        <span key={item.id} className="rounded-full ring-2 ring-surface" style={{ marginLeft: i === 0 ? 0 : -size / 4 }}>
          <Avatar id={item.id} name={item.name} size={size} />
        </span>
      ))}
      {extra > 0 ? (
        <span
          className="inline-flex items-center justify-center rounded-full bg-sunken text-[11px] font-semibold text-muted ring-2 ring-surface"
          style={{ width: size, height: size, marginLeft: -size / 4 }}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  );
}
