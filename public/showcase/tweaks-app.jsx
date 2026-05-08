// MCOP — tweaks app: three expressive controls.
// Atmosphere reshapes color/matcap world. Form swaps the hero crystal.
// Tempo dilates motion across every animated element.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "atmosphere": "obsidian",
  "form": "knot",
  "tempo": "drift"
}/*EDITMODE-END*/;

function applyTweaks(t) {
  // 1. atmosphere → CSS variant + matcap palette key
  document.body.dataset.atmosphere = t.atmosphere;
  // 2. form → hero crystal geometry key
  // 3. tempo → motion multiplier
  const tempoMul = { stillness: 0.18, drift: 1, pulse: 2.6 }[t.tempo] || 1;
  window.MCOPConfig = {
    atmosphere: t.atmosphere,
    form: t.form,
    tempo: t.tempo,
    tempoMul,
  };
  window.dispatchEvent(new CustomEvent("mcop:config"));
  // ticker speed
  document.querySelectorAll(".ticker-track").forEach((el) => {
    el.style.animationDuration = `${60 / Math.max(0.25, tempoMul)}s`;
  });
  // pulse dot
  document.querySelectorAll(".eyebrow .pulse").forEach((el) => {
    el.style.animationDuration = `${1.8 / Math.max(0.4, tempoMul)}s`;
  });
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => { applyTweaks(t); }, [t]);

  return (
    <TweaksPanel title="Tweaks · MCOP">
      <TweakSection label="Atmosphere">
        <TweakRadio
          label="Mood"
          value={t.atmosphere}
          options={[
            { value: "obsidian", label: "Obsidian" },
            { value: "bone", label: "Bone" },
            { value: "plasma", label: "Plasma" },
          ]}
          onChange={(v) => setTweak("atmosphere", v)}
        />
      </TweakSection>

      <TweakSection label="Form">
        <TweakRadio
          label="Hero crystal"
          value={t.form}
          options={[
            { value: "knot", label: "Knot" },
            { value: "crystal", label: "Crystal" },
            { value: "sphere", label: "Orb" },
          ]}
          onChange={(v) => setTweak("form", v)}
        />
      </TweakSection>

      <TweakSection label="Tempo">
        <TweakRadio
          label="Motion"
          value={t.tempo}
          options={[
            { value: "stillness", label: "Still" },
            { value: "drift", label: "Drift" },
            { value: "pulse", label: "Pulse" },
          ]}
          onChange={(v) => setTweak("tempo", v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

// boot panel into hidden mount; apply defaults immediately so first paint
// reflects whatever was persisted in the EDITMODE block.
applyTweaks(TWEAK_DEFAULTS);
const mount = document.getElementById("tweaks-mount");
ReactDOM.createRoot(mount).render(<App />);
