import React from "react";
import { Button } from "@/components/ui/button";

export default function LoadError({ onRetry, message = "We could not load these records. Please try again." }) {
  return <div role="alert" className="text-center py-10 px-4 text-slate-600"><p className="mb-4">{message}</p><Button variant="outline" onClick={onRetry}>Try again</Button></div>;
}
