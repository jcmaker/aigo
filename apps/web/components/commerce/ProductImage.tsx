import Image from "next/image";

const FALLBACK = "/products/dashpi.webp";

/** 사진 배경이 흰색이라 어두운 테마에서도 흰 면 위에 둔다. */
export function ProductImage({ src, alt, sizes }: { src?: string | null; alt: string; sizes: string }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden border border-line bg-white">
      <Image src={src || FALLBACK} alt={alt} fill sizes={sizes} className="object-contain" />
    </div>
  );
}
