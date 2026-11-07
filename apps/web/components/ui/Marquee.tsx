function Track({ items, hidden }: { items: string[]; hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined} className="marquee-track flex min-w-full shrink-0 justify-around">
      {items.map((item) => (
        <li key={item} className="hud flex items-center gap-8 pl-8 whitespace-nowrap text-muted">
          <span>{item}</span>
          <span aria-hidden className="text-accent-ink">
            /
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Marquee({ items }: { items: string[] }) {
  return (
    <div className="marquee flex overflow-hidden border-y border-line py-3">
      <Track items={items} />
      <Track items={items} hidden />
    </div>
  );
}
