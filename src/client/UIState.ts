import { PlayerBuildableUnitType } from "../core/game/Game";

export interface UIState {
  attackRatio: number;
  ghostStructure: PlayerBuildableUnitType | null;
  rocketDirectionUp: boolean;
  upgradeMultiplier: number;
  /**
   * Units on the build bar's active tab, in slot order. Unshifted digit keys
   * 1-9 build slot N of whichever tab is showing, so the numbers printed on
   * the bar are the keys that work. Unset until the bar first renders.
   */
  buildBarItems?: PlayerBuildableUnitType[];
  /**
   * True while Diplomacy → Cede / Embassy is marking tiles. Map clicks then
   * belong to the selection, not to attacks or unit selection.
   */
  territorySelection?: boolean;
}
