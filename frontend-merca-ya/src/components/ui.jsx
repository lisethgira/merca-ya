export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    accent: 'bg-orange-500 text-white hover:bg-orange-600',
    ghost: 'border border-slate-200 bg-white text-indigo-950 hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

const control = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

export function TextInput({ className = '', ...props }) {
  return <input className={`${control} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return <select className={`${control} ${className}`} {...props}>{children}</select>;
}

export function TextArea({ className = '', ...props }) {
  return <textarea className={`${control} ${className}`} {...props} />;
}

export function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium text-indigo-950">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Badge({ children, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-700',
    orange: 'bg-orange-50 text-orange-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-600',
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Stars({ value }) {
  const score = Math.round(Number(value) || 0);
  return (
    <span className="text-sm text-orange-500" aria-label={`${value || 0} de 5 estrellas`}>
      {'★★★★★'.slice(0, score)}
      <span className="text-slate-300">{'★★★★★'.slice(score)}</span>
    </span>
  );
}

export function Empty({ title, text }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-indigo-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{children}</p>;
}
