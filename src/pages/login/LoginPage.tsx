import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { employees } from "@/shared/mock";

export function LoginPage() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState("e1");
  const [pin, setPin] = useState("");

  return (
    <div className="grid h-full place-items-center bg-slate-950">
      <form
        className="w-[320px] rounded-lg border border-white/10 bg-slate-900 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          navigate("/pos");
        }}
      >
        <p className="text-[12px] font-semibold uppercase tracking-widest text-teal-400">Madina Electric</p>
        <h1 className="mt-1 text-lg font-semibold text-white">Staff login</h1>
        <div className="mt-4 grid gap-3">
          <div className="grid gap-1">
            {employees.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => setStaff(person.id)}
                className={`flex h-9 items-center justify-between rounded-md px-3 text-left text-[13px] ${
                  staff === person.id ? "bg-teal-700 text-white" : "bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
              >
                <span>{person.name}</span>
                <span className="text-[11px] opacity-70">{person.role}</span>
              </button>
            ))}
          </div>
          <Field label="PIN">
            <Input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              className="bg-slate-800 text-white border-white/10"
            />
          </Field>
          <Button variant="primary" type="submit">
            Enter shop
          </Button>
          <button type="button" className="text-[12px] text-slate-500" onClick={() => navigate("/setup")}>
            Setup / join another PC
          </button>
        </div>
      </form>
    </div>
  );
}
