// The pool the stock showcase ranks. Every shelf — today's biggest movers, what
// sits near its 12-month low or high, what is most heavily traded — is computed
// from one batched quote over this list, so the whole feature costs a single
// request no matter how many shelves it feeds.
//
// These are large US companies: the S&P 500's recognisable names. A beginner
// learns nothing from a micro-cap they have never heard of topping the gainers,
// so the pool is deliberately capped at companies with real businesses behind
// them. Membership drifts a few names a year; this is a plain list, safe to
// edit, and a ticker that stops resolving is simply dropped.

export const SHOWCASE_ETFS = [
  "SPY", // S&P 500 — the 500 largest US companies
  "VOO", // same index, Vanguard's version
  "QQQ", // the 100 largest non-financial Nasdaq companies
  "VTI", // the entire US market, ~3,700 companies
  "DIA", // the Dow's 30 industrial giants
  "IWM", // 2,000 small US companies
  "SCHD", // US companies with a long dividend record
  "VXUS", // the world outside the US
];

export const ETF_NOTES: Record<string, string> = {
  SPY: "The 500 biggest US companies, in one holding",
  VOO: "The same 500 companies, at a lower yearly fee",
  QQQ: "The 100 largest Nasdaq companies — heavily technology",
  VTI: "Every listed US company, around 3,700 of them",
  DIA: "The 30 industrial giants of the Dow",
  IWM: "2,000 small US companies — more volatile than the rest",
  SCHD: "US companies with a long record of paying dividends",
  VXUS: "Everything outside the US, in one holding",
};

export const SHOWCASE_STOCKS = [
  // Technology & semiconductors
  "AAPL","MSFT","NVDA","AVGO","ORCL","CRM","AMD","ADBE","CSCO","ACN","INTC","IBM","QCOM","TXN","NOW","INTU","AMAT","MU","ADI","LRCX","KLAC","PANW","SNPS","CDNS","ANET","APH","MSI","ROP","FTNT","NXPI","MCHP","ON","TEL","GLW","HPQ","DELL","HPE","WDC","STX","SMCI","TER","SWKS","MPWR","ZBRA","NTAP","AKAM","FFIV","CTSH","IT","GDDY","EPAM","PTC","TYL","CDW","KEYS","TDY","JBL","VRSN",
  // Communication & media
  "GOOGL","GOOG","META","NFLX","DIS","CMCSA","T","VZ","TMUS","CHTR","EA","TTWO","WBD","OMC","IPG","LYV","NWSA","FOXA","MTCH",
  // Consumer discretionary
  "AMZN","TSLA","HD","MCD","BKNG","LOW","TJX","SBUX","NKE","CMG","ORLY","AZO","ROST","MAR","HLT","GM","F","YUM","DHI","LEN","NVR","PHM","EBAY","ULTA","DRI","LVS","WYNN","MGM","RCL","CCL","NCLH","EXPE","APTV","LKQ","BBY","DPZ","POOL","TSCO","GRMN","WSM","KMX","CZR",
  // Consumer staples
  "WMT","COST","PG","KO","PEP","PM","MO","MDLZ","CL","KMB","GIS","SYY","KHC","STZ","KDP","HSY","K","CHD","MKC","CAG","CPB","SJM","HRL","TAP","TSN","EL","CLX","DG","DLTR","KR",
  // Health care
  "LLY","UNH","JNJ","ABBV","MRK","TMO","ABT","DHR","PFE","AMGN","BMY","GILD","ISRG","VRTX","CVS","CI","ELV","MCK","REGN","BSX","SYK","MDT","BDX","ZTS","HCA","COR","IQV","A","IDXX","RMD","DXCM","BIIB","MRNA","WAT","MTD","STE","ZBH","BAX","HOLX","ALGN","CNC","MOH","VTRS","CRL","TECH","INCY",
  // Financials
  "BRK-B","JPM","V","MA","BAC","WFC","GS","MS","AXP","BLK","SPGI","SCHW","C","PGR","CB","MMC","ICE","CME","AON","PNC","USB","TFC","COF","BK","AIG","MET","PRU","TRV","ALL","AFL","AMP","DFS","FIS","GPN","MSCI","MCO","NDAQ","CBOE","STT","NTRS","RJF","SYF","HIG","WTW","BRO","CINF","L","PFG","RF","CFG","KEY","HBAN","FITB","MTB","ZION","CMA",
  // Industrials
  "GE","CAT","RTX","HON","UNP","BA","DE","LMT","UPS","ADP","ETN","ITW","NOC","EMR","GD","CSX","NSC","PH","CMI","FDX","WM","TT","JCI","CARR","PCAR","OTIS","GWW","AME","ROK","FAST","PAYX","VRSK","EFX","URI","IR","DOV","XYL","HUBB","LHX","TDG","HWM","AXON","WAB","SNA","SWK","PNR","ALLE","MAS","JBHT","CHRW","EXPD","ODFL","LUV","DAL","UAL","AAL",
  // Energy
  "XOM","CVX","COP","EOG","SLB","PSX","MPC","VLO","WMB","OKE","KMI","HES","DVN","FANG","HAL","BKR","OXY","APA","CTRA","EQT","TRGP",
  // Utilities
  "NEE","SO","DUK","SRE","AEP","D","EXC","XEL","ED","PEG","WEC","ES","AWK","EIX","DTE","PPL","FE","AEE","CMS","CNP","ATO","NI","LNT","EVRG","PNW","NRG","AES",
  // Real estate
  "PLD","AMT","EQIX","CCI","PSA","O","SPG","WELL","DLR","VICI","AVB","EQR","EXR","MAA","INVH","ARE","VTR","UDR","HST","KIM","REG","BXP","IRM","CBRE",
  // Materials
  "LIN","SHW","APD","ECL","FCX","NEM","NUE","DOW","DD","PPG","VMC","MLM","IFF","ALB","STLD","CE","LYB","CF","MOS","FMC","PKG","IP","AVY","AMCR","BALL",
];

/** Everything the stock showcase needs priced, in one array, de-duplicated. */
export function showcaseSymbols(): string[] {
  return Array.from(new Set([...SHOWCASE_ETFS, ...SHOWCASE_STOCKS]));
}

// ---------------------------------------------------------------------------
// Crypto
// ---------------------------------------------------------------------------
// Every ticker below was checked against Yahoo before being listed, because the
// obvious guesses are wrong: UNI-USD is "UNICORN Token" and not Uniswap,
// APT-USD is Apricot Finance and not Aptos, SUI-USD is Salmonation, ARB-USD is
// ARbit, PEPE-USD is PEPEGOLD, POL-USD is Proof Of Liquidity. All of those are
// near-worthless tokens that a beginner would read as the famous name. These
// fifteen resolve to the real coin and carry a real market cap; the floor in
// showcase.ts is the second line of defence if one is ever renamed away.
export const CRYPTO_MAJORS = [
  "BTC-USD",
  "ETH-USD",
  "BNB-USD",
  "XRP-USD",
  "SOL-USD",
  "TRX-USD",
  "DOGE-USD",
  "XMR-USD",
  "LINK-USD",
  "ADA-USD",
  "XLM-USD",
  "BCH-USD",
  "LTC-USD",
  "HBAR-USD",
  "AVAX-USD",
];

// Kept out of the movement shelves on purpose: a coin pegged to the dollar has
// no interesting day, and it would crowd out the ones that do.
export const CRYPTO_STABLE = ["USDT-USD", "USDC-USD", "DAI-USD"];

export const CRYPTO_START = ["BTC-USD", "ETH-USD"];

export const CRYPTO_NOTES: Record<string, string> = {
  "BTC-USD": "The first one, and the one every other coin is measured against",
  "ETH-USD": "The second largest — a platform other projects are built on",
  "USDT-USD": "Pegged to the dollar — used to sit still, not to grow",
  "USDC-USD": "Also pegged to the dollar, by a US-regulated issuer",
  "DAI-USD": "Pegged to the dollar, backed by crypto held as collateral",
};

/** Everything the crypto showcase needs priced. */
export function cryptoShowcaseSymbols(): string[] {
  return Array.from(new Set([...CRYPTO_MAJORS, ...CRYPTO_STABLE]));
}
