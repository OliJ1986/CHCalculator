from dataclasses import dataclass

from .foods import normalize_query


@dataclass(frozen=True)
class QueryAlias:
    key: str
    usda_query: str
    display_name: str


_ALIASES = {
    "alma": QueryAlias("alma", "apple", "Alma"),
    "banan": QueryAlias("banan", "banana", "Banán"),
    "korte": QueryAlias("korte", "pear", "Körte"),
    "narancs": QueryAlias("narancs", "orange", "Narancs"),
    "citrom": QueryAlias("citrom", "lemon", "Citrom"),
    "burgonya": QueryAlias("burgonya", "potato", "Burgonya"),
    "krumpli": QueryAlias("burgonya", "potato", "Burgonya"),
    "rizs": QueryAlias("rizs", "rice", "Rizs"),
    "fott rizs": QueryAlias("fott rizs", "cooked rice", "Főtt rizs"),
    "teszta": QueryAlias("teszta", "pasta", "Tészta"),
    "serteshus": QueryAlias("serteshus", "pork", "Sertéshús"),
    "marhahus": QueryAlias("marhahus", "beef", "Marhahús"),
    "porcukor": QueryAlias("porcukor", "powdered sugar", "Porcukor"),
    "cukor": QueryAlias("cukor", "sugar", "Cukor"),
    "liszt": QueryAlias("liszt", "flour", "Liszt"),
    "csirkemell": QueryAlias("csirkemell", "chicken breast", "Csirkemell"),
    "tej": QueryAlias("tej", "milk", "Tej"),
    "tojas": QueryAlias("tojas", "egg", "Tojás"),
    "sajt": QueryAlias("sajt", "cheese", "Sajt"),
    "vaj": QueryAlias("vaj", "butter", "Vaj"),
    "kenyer": QueryAlias("kenyer", "bread", "Kenyér"),
    "zabpehely": QueryAlias("zabpehely", "oats", "Zabpehely"),
    "paradicsom": QueryAlias("paradicsom", "tomato", "Paradicsom"),
    "paprika": QueryAlias("paprika", "bell pepper", "Paprika"),
    "uborka": QueryAlias("uborka", "cucumber", "Uborka"),
    "sargarepa": QueryAlias("sargarepa", "carrot", "Sárgarépa"),
}

_SEARCH_TERM_TRANSLATIONS = {
    "joghurt": "yogurt",
    "joghurtok": "yogurt",
    "suti": "dessert",
    "sutemeny": "cake",
}


def resolve_alias(query: str) -> QueryAlias | None:
    return _ALIASES.get(normalize_query(query))


def translate_search_query(query: str) -> str:
    """Translate only curated generic search terms for a provider query."""
    translated: list[str] = []
    for token in normalize_query(query).split():
        replacement = _SEARCH_TERM_TRANSLATIONS.get(token)
        if replacement is None:
            direct_alias = _ALIASES.get(token)
            replacement = direct_alias.usda_query if direct_alias else None
        if replacement is None and token.endswith("os"):
            base_alias = _ALIASES.get(token[:-2])
            replacement = base_alias.usda_query if base_alias else None
        translated.append(replacement or token)
    return " ".join(translated)


def alias_display_name(alias: QueryAlias | None, source_name: str) -> str:
    normalized = normalize_query(source_name).replace(",", "")
    curated = {
        ("alma", "apples raw with skin"): "Alma, nyers, héjjal",
        ("alma", "apples raw without skin"): "Alma, nyers, héj nélkül",
        ("banan", "bananas raw"): "Banán, nyers",
        ("korte", "pears raw"): "Körte, nyers",
        ("narancs", "oranges raw"): "Narancs, nyers",
        ("citrom", "lemons raw"): "Citrom, nyers",
        ("burgonya", "potatoes raw flesh and skin"): "Burgonya, nyers, héjjal",
        ("rizs", "rice white long grain regular enriched cooked"): "Rizs, fehér, főtt",
        ("teszta", "pasta, cooked, enriched, without added salt"): "Tészta, főtt",
        ("csirkemell", "chicken, broilers or fryers, breast, meat only, raw"): "Csirkemell, nyers",
        ("tej", "milk, whole"): "Tej, teljes",
        ("tojas", "egg, whole, raw, fresh"): "Tojás, nyers",
        ("porcukor", "sugars powdered"): "Porcukor",
    }
    if alias and (alias.key, normalized) in curated:
        return curated[(alias.key, normalized)]
    if alias and alias.key == "banan" and "banana pepper" in normalized and normalized.startswith(
        ("banana pepper ", "banana peppers ")
    ):
        return "Paprika, banánpaprika, nyers" if "raw" in normalized else source_name
    if alias and alias.key == "banan" and "overripe" in normalized and normalized.startswith(("banana ", "bananas ")):
        return "Banán, túlérett, nyers"
    if alias and alias.key == "banan" and "dehydrated" in normalized and normalized.startswith(("banana ", "bananas ")):
        return "Banán, aszalt vagy banánpor"
    if alias and alias.key == "paprika" and "banana" in normalized and normalized.startswith(
        ("pepper ", "peppers ", "banana pepper ", "banana peppers ")
    ):
        return "Paprika, banánpaprika, nyers"
    pattern_labels = {
        "alma": (("apple", "raw"), "Alma, nyers"),
        "banan": (("banana", "raw"), "Banán, nyers"),
        "korte": (("pear", "raw"), "Körte, nyers"),
        "narancs": (("orange", "raw"), "Narancs, nyers"),
        "citrom": (("lemon", "raw"), "Citrom, nyers"),
        "burgonya": (("potato", "raw"), "Burgonya, nyers"),
        "csirkemell": (("chicken", "breast"), "Csirkemell"),
        "serteshus": (("pork",), "Sertéshús"),
        "marhahus": (("beef",), "Marhahús"),
        "tojas": (("egg", "raw"), "Tojás, nyers"),
        "tej": (("milk",), "Tej"),
        "sajt": (("cheese",), "Sajt"),
        "vaj": (("butter",), "Vaj"),
        "kenyer": (("bread",), "Kenyér"),
        "zabpehely": (("oat",), "Zabpehely"),
        "liszt": (("flour",), "Liszt"),
        "paradicsom": (("tomato",), "Paradicsom"),
        "paprika": (("pepper",), "Paprika"),
        "uborka": (("cucumber",), "Uborka"),
        "sargarepa": (("carrot",), "Sárgarépa"),
    }
    if alias:
        pattern = pattern_labels.get(alias.key)
        if pattern and normalized.startswith(f"{pattern[0][0]} ") and all(marker in normalized for marker in pattern[0]):
            return pattern[1]
    return source_name


def display_usda_name(source_name: str) -> str:
    """Apply a curated Hungarian label without using the query as context."""
    seen_keys: set[str] = set()
    for alias in _ALIASES.values():
        if alias.key in seen_keys:
            continue
        seen_keys.add(alias.key)
        display_name = alias_display_name(alias, source_name)
        if display_name != source_name:
            return display_name
    return source_name
