type Props = { className?: string; title?: string };

export default function BrandMark({ className, title = "SiProper" }: Props) {
  return <img src="/fav_sg.png" alt={title} className={className} />;
}
