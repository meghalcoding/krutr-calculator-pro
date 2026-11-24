# KRUTr Calculator Pro — Financial Engine Specification

## Approved commercial rules

1. Client discount reduces the gross client bill rate.
2. MSP/VMS is a separate line-item deduction calculated on the discounted bill rate.
3. Net revenue is discounted bill rate less MSP/VMS fee.
4. Loaded candidate cost is candidate pay plus overhead.
5. Gross profit is net revenue less loaded candidate cost.
6. Net revenue margin is gross profit divided by net revenue.
7. Markup is gross profit divided by loaded candidate cost.

## Core equations

Let:
- `B` = gross bill rate
- `D` = client discount percentage
- `V` = MSP/VMS fee percentage
- `P` = candidate pay rate
- `O` = overhead percentage

All percentage inputs are entered as percentage points (e.g. `5` means `5%`).

```text
Discount amount       = B × D / 100
Discounted bill rate  = B − Discount amount
MSP/VMS fee           = Discounted bill rate × V / 100
Net revenue           = Discounted bill rate − MSP/VMS fee
Overhead amount       = P × O / 100
Loaded pay cost       = P + Overhead amount
Gross profit          = Net revenue − Loaded pay cost
Net revenue margin    = Gross profit / Net revenue × 100
Markup                = Gross profit / Loaded pay cost × 100
```

## Maximum Pay Rate

Markup strategy:
```text
Target loaded pay cost = Net revenue / (1 + Markup / 100)
Theoretical maximum pay = Target loaded pay cost / (1 + Overhead / 100)
```

Desired-profit strategy:
```text
Target loaded pay cost = Net revenue − Desired gross profit
Theoretical maximum pay = Target loaded pay cost / (1 + Overhead / 100)
```

Practical maximum pay is rounded **down** to the nearest cent.

## Bill Rate

Markup strategy:
```text
Required net revenue = Loaded pay cost × (1 + Markup / 100)
```

Desired-profit strategy:
```text
Required net revenue = Loaded pay cost + Desired gross profit
```

Both strategies:
```text
Gross bill rate = Required net revenue /
                  ((1 − Discount / 100) × (1 − VMS / 100))
```

Practical quoted bill rate is rounded **up** to the nearest cent.

## Defaults and constraints

- Currency: USD.
- Default overhead: 25%.
- Default client discount: 0%.
- Default MSP/VMS fee: 0%.
- Desired gross profit: $0–$500 per hour.
- Discount and MSP/VMS fee: 0–100%.
- Overhead and markup: non-negative.
- Pay rate: non-negative.
- Gross bill rate: greater than zero for margin analysis.
- A 100% deduction that leaves zero net revenue is invalid for rate calculations.
- Losses are valid margin-analysis outcomes and must be displayed as losses.
- Calculations use full precision internally; currency presentation uses two decimal places.

## Engineering notes

- The engine is a pure JavaScript module and does not access the DOM.
- It supports browser global usage (`window.KRUTrPricingEngine`) and CommonJS (`require`).
- UI integration, IndexedDB, presets and calculation history are separate concerns.
- `grossProfit` here means profit after modeled candidate overhead and MSP/VMS deductions, before any additional unmodeled operating expenses.
