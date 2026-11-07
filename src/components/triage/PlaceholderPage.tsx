import { PageHeader, Placeholder } from "./ui";

export function PlaceholderPage({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div>
      <PageHeader eyebrow={eyebrow} title={title} />
      <Placeholder text={text} />
    </div>
  );
}
