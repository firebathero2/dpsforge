p_4_5 = 0.21
p_5_6 = 0.18
p_6_7 = 0.15

cost_4 = 771

# E[i+1] = (2 * E[i]) / p_i_i+1
# Starting from tier 4
E_4 = cost_4
E_5 = (2 * E_4) / p_4_5
E_6 = (2 * E_5) / p_5_6
E_7 = (2 * E_6) / p_6_7

expected_cost = E_7
margin_price = expected_cost * 1.5

print(f"Expected gold cost: {expected_cost}")
print(f"50% margin price: {margin_price}")
print(f"Rounded integer: {round(margin_price)}")
