import { cn, initials } from "@/lib/format";

type AvatarProps = {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
};

/** 有头像就显示图片，没有就用名字首字生成一个色块头像 */
export function Avatar({ name, url, size = 36, className }: AvatarProps) {
  const style = { width: size, height: size };

  if (url) {
    return (
      // 头像是用户上传的远程图片，这里用原生 img 避免为每种尺寸都生成 next/image 配置
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        style={style}
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-ink-700/60", className)}
      />
    );
  }

  return (
    <span
      style={{ ...style, fontSize: Math.max(11, Math.round(size * 0.38)) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-brand-500/20 font-semibold text-brand-200 ring-1 ring-brand-500/25",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
