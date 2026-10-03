import { Suspense } from "react";
import { MapClient } from "../../components/MapClient";

export default function MapPage() {
  return (
    <Suspense fallback={<main className="shell"><div className="sectionTitle"><h2>Loading live map…</h2></div></main>}>
      <MapClient />
    </Suspense>
  );
}
