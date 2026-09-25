from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, Food, Profile
from app.schemas import CustomFoodCreateRequest, GuestCustomFoodImport, GuestImportRequest, MealCreateRequest, MealPlanCreateRequest, MealPlanUpdateRequest, RecipeCreateRequest, RecipeIngredientRequest, RecipeMealRequest, ShoppingItemCreateRequest
from app.services.custom_foods import create_custom_food, list_custom_foods
from app.services.planner import create_plan, list_plans, update_plan
from app.services.recipes import create_recipe, get_recipe_response
from app.services.shopping import create_item, generate_from_plans
from app.services.meals import create_meal
from app.services.recipes import log_recipe_meal
from app.services.guest_import import import_guest_data


def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        profile = Profile(id="p1", timezone="Europe/Budapest")
        food = Food(id="f1", name="Rizs", original_name="Rice", normalized_name="rizs", source="fixture", source_id="f1",
                    available_carbs_100g=80, category="grains", is_generic=True, is_verified=True)
        db.add_all([profile, food]); db.commit()
        yield db


def test_custom_food_recipe_plan_and_shopping_snapshot():
    db = next(db_session())
    own = create_custom_food(db, "p1", CustomFoodCreateRequest(name="Saját zabkása", available_carbs_100g=12.5))
    assert own.available_carbs_100g == 12.5
    recipe = create_recipe(db, "p1", RecipeCreateRequest(name="Reggeli", servings=2, total_weight_g=400,
        ingredients=[RecipeIngredientRequest(food_id="f1", quantity_g=100), RecipeIngredientRequest(custom_food_id=own.id, quantity_g=200)]))
    assert round(recipe.total_carbs_g, 3) == 105.0
    assert round(recipe.carbs_per_serving_g, 3) == 52.5
    plan = create_plan(db, "p1", MealPlanCreateRequest(plan_date=date(2026, 9, 25), recipe_id=recipe.id, quantity=1, quantity_unit="servings"))
    assert plan.planned_carbs_g == 52.5
    plan = update_plan(db, "p1", plan.id, MealPlanUpdateRequest(quantity=2))
    assert plan.planned_carbs_g == 105.0
    items = generate_from_plans(db, "p1", date(2026, 9, 25), date(2026, 9, 25))
    assert {item.name for item in items} == {"Rizs", "Saját zabkása"}
    create_item(db, "p1", ShoppingItemCreateRequest(name="Rizs", quantity=1, unit="db"))
    items = generate_from_plans(db, "p1", date(2026, 9, 25), date(2026, 9, 25))
    assert len([item for item in items if item.name == "Rizs"]) == 2
    assert len(list_custom_foods(db, "p1")) == 1
    meal = create_meal(db, MealCreateRequest(custom_food_id=own.id, amount_g=100, local_date=date(2026, 9, 25), idempotency_key="custom-meal-1"), "p1")
    assert meal.custom_food_id == own.id and meal.calculated_carbs_g == 12.5
    logged = log_recipe_meal(db, "p1", recipe.id, RecipeMealRequest(quantity=1, idempotency_key="recipe-meal-1", local_date=date(2026, 9, 25)), "Europe/Budapest")
    assert float(logged.calculated_carbs_g) == 52.5
    retry = log_recipe_meal(db, "p1", recipe.id, RecipeMealRequest(quantity=1, idempotency_key="recipe-meal-1", local_date=date(2026, 9, 25)), "Europe/Budapest")
    assert retry.id == logged.id


def test_profile_isolation_for_custom_foods():
    db = next(db_session())
    create_custom_food(db, "p1", CustomFoodCreateRequest(name="Titkos", available_carbs_100g=1))
    assert list_custom_foods(db, "p2") == []


def test_guest_custom_food_import_is_idempotent():
    db = next(db_session())
    payload = GuestImportRequest(custom_foods=[GuestCustomFoodImport(id="guest-own-1", name="Saját", available_carbs_100g=9.5)])
    assert import_guest_data(db, db.get(Profile, "p1"), payload)[4:] == (1, 0)
    assert import_guest_data(db, db.get(Profile, "p1"), payload)[4:] == (0, 1)
