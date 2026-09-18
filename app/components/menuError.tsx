const MenuError = ({ message }: { message: string }) => {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      {/* Decorative line */}
      <div className="flex items-center gap-4 mb-8 w-full max-w-xs">
        <span className="h-px flex-1 bg-[#8b6bff]/20" />
        <span className="text-[#8b6bff]/40 text-xs tracking-[0.4em]">✦</span>
        <span className="h-px flex-1 bg-[#8b6bff]/20" />
      </div>

      <p className="text-xs uppercase tracking-[0.4em] text-[#6b5e9c] mb-3">
        Something went wrong
      </p>

      <h2 className="text-2xl font-light text-[#cdbbff] tracking-widest mb-4">
        Menu Unavailable
      </h2>

      <p className="text-sm text-[#9f93c9] max-w-sm leading-relaxed mb-8">
        {message}
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="text-xs uppercase tracking-[0.3em] text-[#cdbbff] border border-[#8b6bff]/30 px-6 py-3 hover:border-[#8b6bff]/70 hover:bg-[#8b6bff]/5 transition-colors duration-300"
      >
        Try Again
      </button>

      {/* Decorative line */}
      <div className="flex items-center gap-4 mt-8 w-full max-w-xs">
        <span className="h-px flex-1 bg-[#8b6bff]/20" />
        <span className="text-[#8b6bff]/40 text-xs tracking-[0.4em]">✦</span>
        <span className="h-px flex-1 bg-[#8b6bff]/20" />
      </div>
    </div>
  );
};

export default MenuError;
