type PagePlaceholderProps = {
  title: string;
  description: string;
};

export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="max-w-2xl space-y-2">
      <h2 className="text-foreground text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="text-muted-foreground text-sm leading-6">{description}</p>
    </div>
  );
}
