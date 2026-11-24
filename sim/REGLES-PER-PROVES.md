# Caupoli: rules the engine should follow (for testers)

You play through `node sim/cli.mjs <command>` from `C:\Documentos\CAU\monopoli-cau`. Every command prints the state.
Each PowerShell call starts fresh, so ALWAYS set your own state file in the same command, e.g.:

```
$env:CAUPOLI_FILE="C:\Users\Pause\AppData\Local\Temp\caupoli-X.json"; node sim/cli.mjs new
$env:CAUPOLI_FILE="C:\Users\Pause\AppData\Local\Temp\caupoli-X.json"; node sim/cli.mjs roll 4
```

Commands: `new [startMoney]`, `rules key=value ...`, `state`, `board` (all squares, owners, rents), `log [n]`,
`roll N`, `buy`, `auction`, `skip`, `bid TEAM PRICE`, `card`, `end`, `build SQ`, `sell SQ`, `mortgage SQ` (toggles),
`money TEAM AMOUNT [TO_TEAM]` (negative amount = pay bank), `trade A B propsA propsB moneyA moneyB` (props as `4,5` or `-`),
`owner SQ TEAM|bank` (admin), `place TEAM SQ [land]` (admin), `jail TEAM` (admin toggle), `payjail`, `jailcard`,
`jailcards TEAM N`, `minigame 0:2,1:1,2:-1,3:-2`, `draw TEAM good|bad`, `bankrupt TEAM`, `revive TEAM`, `undo`.
A line starting with `>>` is the message/error returned by the action.

## Board (24 squares, one die)
0 Sortida (GO) · 1-2 brown · 3 station · 4-5 light blue · 6 Presó (jail / just visiting) · 7-8 pink · 9 station · 10-11 orange ·
12 Multa (pay 100) · 13-14 red · 15 station · 16-17 yellow · 18 Ves a la presó (go to jail) · 19-20 green · 21 station · 22-23 dark blue.
Teams 0-3 play in order 0,1,2,3; the round number goes up when the turn goes back to team 0. Bankrupt teams are skipped.

## Rules
- `roll N` moves N squares. Passing or landing on Sortida pays the go salary (200).
- Unowned street/station: a pending `buy` appears → `buy`, `auction` or `skip`. You can only buy if you have enough money.
- Rent is paid automatically: street base rent; double if the owner has the whole colour group and no houses; with houses rent[n] (5 = hotel);
  mortgaged = no rent. Stations: 40/80/150/250 for 1/2/3/4 stations owned by that owner. You never pay rent on your own property.
- Multa: pay 100. Ves a la presó: go straight to square 6 in jail, no go salary.
- Jail (defaults: jailPay=true, jailFine=50, jailRoll=true, jailExitRoll=6, jailMaxTurns=3): on your turn in jail you may `payjail` (if jailPay) or
  `jailcard` (if you hold one) and then roll normally; or just `roll`: rolling the exit number frees you and you move; otherwise you stay
  (turn counter +1). When the counter reaches jailMaxTurns you leave (paying jailFine only if jailPay) and move by that roll.
  Landing on 6 without being sent there is just visiting. Movement cards do not move a team that is in jail.
- Building: you need the whole colour group, nothing mortgaged in it, build evenly (no square more than 1 house above the others in its group),
  max 5 (= hotel), cost = house price. Selling a house gives half its price, sell evenly. Mortgage: only if the group has no houses; you get
  price/2; lifting it costs ceil(price/2 × 1.1). Building, selling and (un)mortgaging is only allowed on the owner's own turn, or at any time if
  the owner has negative money.
- `end` is refused while the current team has negative money. A team with negative money and nothing left to sell or mortgage goes bankrupt
  automatically: properties back to the bank, out of the game. When only one team is left it is the winner.
- Minigame: `minigame team:n,...` — n>0 = that many cards from the good deck (Bona Acció), n<0 = bad deck (Mal Rotllet). They queue up;
  `card` applies the first one. Effects: money (+/−), each (collect from / pay to each other active team), goto square (collects go salary when
  passing Sortida), move ±N, jail, jailfree (kept), repairs (per house; hotel = 3×), skip (loses next turn), extra (one extra roll after `end`), text.
- Trades: both teams active, each gives only what it owns, no property whose group has houses. Auction of an owned property: the price goes to
  the previous owner. A bankrupt team cannot receive properties, cards or moves.
- `undo` must bring back exactly the state before the last action.
- All messages are in Catalan: also report spelling/grammar mistakes or confusing messages.
