import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";

export default function Login() {
  const { login } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token } = await api.login(password);
      login(token);
    } catch {
      setError("incorrect password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center h-screen bg-[#050608] font-mono text-[#93a2a8]">
      <form onSubmit={submit} className="w-full max-w-xs border border-[#132227] p-6 rounded">
        <div className="text-[#f5f8f9] font-bold tracking-widest mb-6">VIGILANT.</div>
        <label className="block text-[11px] tracking-wide mb-2">admin password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 mb-3 bg-[#070b0d] border border-[#1f4952] text-[#f5f8f9] text-xs rounded outline-none focus:border-[#4de8f5]"
        />
        {error && <div className="text-xs text-[#ff6b5e] mb-3">{error}</div>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full px-4 py-2 text-xs tracking-wide border border-[#1f4952] text-[#4de8f5] hover:bg-[#0f2226] rounded disabled:opacity-40"
        >
          {loading ? "logging in…" : "log in"}
        </button>
      </form>
    </div>
  );
}
