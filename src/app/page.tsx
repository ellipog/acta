import { SiteHeader } from "@/components/site-chrome";
import { CoreSample, type CoreLayer } from "@/components/core-sample";
import { Contact } from "@/components/strata";
import { Hero } from "@/components/landing/hero";
import { BoardSection, FieldsSection, HandsSection } from "@/components/landing/middle";
import { SedimentSection } from "@/components/landing/sediment";
import { RoadmapSection } from "@/components/landing/roadmap";
import { BedrockSection } from "@/components/landing/bedrock";

const core: CoreLayer[] = [
  { id: "surface", label: "Surface", rock: "Surface", base: "page", tone: "pyrite", level: 12 },
  { id: "board", label: "The board", rock: "Basalt", base: "depth-1", tone: "ink", level: 50 },
  { id: "fields", label: "Fields", rock: "Crystal", base: "depth-2", tone: "lapis", level: 25 },
  { id: "hands", label: "Teams", rock: "Sandstone", base: "depth-3", tone: "pyrite", level: 25 },
  { id: "sediment", label: "Activity", rock: "Shale", base: "depth-4", tone: "ink", level: 12 },
  { id: "roadmap", label: "Roadmap", rock: "Quartz", base: "depth-4", tone: "lapis", level: 50 },
  { id: "bedrock", label: "Get started", rock: "Bedrock", base: "bedrock", tone: "bedrock-muted", level: 25 },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <CoreSample layers={core} />
      <main className="flex-1">
        <Hero />
        <Contact from="page" to="depth-1" seed={2} />
        <BoardSection />
        <Contact from="depth-1" to="depth-2" seed={3} />
        <FieldsSection />
        <Contact from="depth-2" to="depth-3" seed={5} />
        <HandsSection />
        <Contact from="depth-3" to="depth-4" seed={7} />
        <SedimentSection />
        <RoadmapSection />
        <Contact from="depth-4" to="bedrock" seed={9} />
        <BedrockSection />
      </main>
    </>
  );
}
