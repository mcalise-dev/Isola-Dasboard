import Image from "next/image";

// THM × Isola co-brand, shown on Tyler's THM pages in the crew app
export default function ThmBrand({ className = "" }: { className?: string }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <Image src="/thm-isola.png" alt="THM corp × Isola Excavation & Design" width={1000} height={417} priority
        className="h-auto w-full max-w-[360px]" />
    </div>
  );
}
