import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Small black pill at the bottom centre, 2.5 s.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="bottom-center"
      duration={2500}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] text-primary-foreground shadow-[var(--shadow-pop)]",
          description: "text-text-3",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
