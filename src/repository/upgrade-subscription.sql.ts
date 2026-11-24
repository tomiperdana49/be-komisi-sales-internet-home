/**
 * The new subscription of an internet invoice, correcting NIS's scheduled
 * upgrades (KOMISI.md 1.4).
 *
 * NIS normally records an upgrade's `new_subscription` as the price
 * difference. For an upgrade scheduled to the start of a billing month, it
 * bills the whole month at the new price and records that full price as new
 * instead. Example: fakhrurjla, nusafiber 50 Mbps [229.000] → Lite 200
 * [250.000] on 2026-11-01, recorded as 250.000 instead of 21.000.
 *
 * For a monthly upgrade invoice whose new_subscription is its whole dpp, and
 * whose service history has a priced "Upgrade : <old> [ p ] &rarr; <new> [ q ]"
 * line with q equal to that dpp, the new part is q − p. The rest of the
 * invoice (p) is then picked up as recurring by the old-customer job. Every
 * other invoice keeps NIS's figure.
 *
 * `c` is the NewCustomerInvoiceInternetCounter alias, `t` the
 * CustomerInvoiceTemp alias and `m` the InvoiceTypeMonth alias.
 */
export function effectiveNewSubscription(c: string, t: string, m: string): string {
  const price = (n: 1 | 2) =>
    `CAST(REPLACE(SUBSTRING_INDEX(SUBSTRING_INDEX(uh.description, ' ]', ${n}), '[ ', -1), '.', '') AS UNSIGNED)`;
  return `IF(
      ${c}.is_upgrade = 1 AND ${c}.new_subscription = ${c}.dpp AND IFNULL(${m}.Month, 1) = 1,
      ${c}.dpp - IFNULL((
        SELECT ${price(1)}
        FROM CustomerServicesHistoryNew uh
        WHERE uh.cust_serv_id = ${t}.CustServId
          AND uh.description LIKE 'Change Package%Upgrade : %[ % ] &rarr; %[ % ]%'
          AND ${price(2)} = ROUND(${c}.dpp)
        ORDER BY uh.insert_time DESC
        LIMIT 1
      ), 0),
      ${c}.new_subscription
    )`;
}
