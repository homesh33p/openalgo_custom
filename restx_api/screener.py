import os

from flask import jsonify, make_response, request
from flask_restx import Namespace, Resource
from marshmallow import ValidationError

from limiter import limiter
from services.screener_service import analyze_symbol
from utils.logging import get_logger

from .data_schemas import ScreenerSchema, ScreenerSymbolsSchema

API_RATE_LIMIT = os.getenv("API_RATE_LIMIT", "10 per second")
api = Namespace("screener", description="Technical Analysis Screener API")

logger = get_logger(__name__)
screener_schema = ScreenerSchema()
screener_symbols_schema = ScreenerSymbolsSchema()


@api.route("/analyze", strict_slashes=False)
class ScreenerAnalyze(Resource):
    @limiter.limit(API_RATE_LIMIT)
    def post(self):
        """Run technical analysis screener on a symbol"""
        try:
            data = screener_schema.load(request.json)

            success, response_data, status_code = analyze_symbol(
                symbol=data["symbol"],
                exchange=data["exchange"],
                interval=data["interval"],
                start_date=data["start_date"].strftime("%Y-%m-%d"),
                end_date=data["end_date"].strftime("%Y-%m-%d"),
                api_key=data["apikey"],
                source=data.get("source", "api"),
            )

            return make_response(jsonify(response_data), status_code)

        except ValidationError as err:
            return make_response(jsonify({"status": "error", "message": err.messages}), 400)
        except Exception as e:
            logger.exception(f"Unexpected error in screener endpoint: {e}")
            return make_response(
                jsonify({"status": "error", "message": "An unexpected error occurred"}), 500
            )


@api.route("/symbols", strict_slashes=False)
class ScreenerSymbols(Resource):
    @limiter.limit(API_RATE_LIMIT)
    def post(self):
        """Search symbols for screener autocomplete (source=api or source=db)"""
        try:
            data = screener_symbols_schema.load(request.json)
            query = data["query"]
            exchange = data.get("exchange")
            source = data.get("source", "api")
            api_key = data["apikey"]

            if source == "db":
                from database.historify_db import get_available_symbols

                all_syms = get_available_symbols()
                q = query.upper()
                filtered = [
                    {"symbol": s["symbol"], "exchange": s["exchange"]}
                    for s in all_syms
                    if q in str(s["symbol"]).upper()
                    and (not exchange or str(s["exchange"]).upper() == exchange.upper())
                ][:20]
                return make_response(
                    jsonify({"status": "success", "data": filtered, "count": len(filtered)}), 200
                )
            else:
                from services.search_service import search_symbols

                success, response_data, status_code = search_symbols(
                    query=query, exchange=exchange, api_key=api_key
                )
                return make_response(jsonify(response_data), status_code)

        except ValidationError as err:
            return make_response(jsonify({"status": "error", "message": err.messages}), 400)
        except Exception as e:
            logger.exception(f"Unexpected error in symbols endpoint: {e}")
            return make_response(
                jsonify({"status": "error", "message": "An unexpected error occurred"}), 500
            )
