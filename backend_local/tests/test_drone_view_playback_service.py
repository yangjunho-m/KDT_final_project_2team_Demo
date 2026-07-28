from app.services.drone_view_playback_service import (
    _display_position_for_frame,
    _position_from_row,
    _to_route_frame,
)


def test_route_preview_position_uses_actual_position() -> None:
    actual_position = {
        "latitude": 37.5541811,
        "longitude": 126.9209826,
        "altitude": 120.0,
    }
    reported_position = {
        "latitude": 37.6,
        "longitude": 127.0,
        "altitude": 120.0,
    }

    route_frame = _to_route_frame(
        {
            "position": reported_position,
            "actualPosition": actual_position,
            "reportedPosition": reported_position,
        },
        include_metadata=False,
    )

    assert route_frame["position"] == actual_position
    assert route_frame["reportedPosition"] == reported_position


def test_route_preview_position_falls_back_when_actual_position_is_missing() -> None:
    display_position = {
        "latitude": 37.5541811,
        "longitude": 126.9209826,
        "altitude": 120.0,
    }

    route_frame = _to_route_frame(
        {
            "position": display_position,
            "actualPosition": {
                "latitude": None,
                "longitude": None,
                "altitude": 120.0,
            },
        },
        include_metadata=False,
    )

    assert route_frame["position"] == display_position


def test_jamming_correction_uses_crossview_position() -> None:
    position = _position_from_row(
        {
            "altitude_agl_m": "120",
            "jamming_corrected_latitude_deg": "37.1",
            "jamming_corrected_longitude_deg": "126.1",
            "crossview_latitude_deg": "37.2",
            "crossview_longitude_deg": "126.2",
            "navigation_latitude_deg": "37.3",
            "navigation_longitude_deg": "126.3",
        },
        "corrected",
        dataset_prefix="jamming-route",
    )

    assert position == {
        "latitude": 37.2,
        "longitude": 126.2,
        "altitude": 120.0,
    }


def test_jamming_correction_falls_back_to_navigation_position() -> None:
    position = _position_from_row(
        {
            "altitude_agl_m": "120",
            "jamming_corrected_latitude_deg": "37.1",
            "jamming_corrected_longitude_deg": "126.1",
            "navigation_latitude_deg": "37.3",
            "navigation_longitude_deg": "126.3",
        },
        "corrected",
        dataset_prefix="jamming-route",
    )

    assert position == {
        "latitude": 37.3,
        "longitude": 126.3,
        "altitude": 120.0,
    }


def test_display_position_uses_corrected_position_after_correction() -> None:
    actual_position = {
        "latitude": 37.1,
        "longitude": 126.1,
        "altitude": 120.0,
    }
    corrected_position = {
        "latitude": 37.2,
        "longitude": 126.2,
        "altitude": 120.0,
    }

    position = _display_position_for_frame(
        actual_position=actual_position,
        corrected_position=corrected_position,
        correction_applied=True,
    )

    assert position == corrected_position


def test_display_position_uses_actual_position_before_correction() -> None:
    actual_position = {
        "latitude": 37.1,
        "longitude": 126.1,
        "altitude": 120.0,
    }
    corrected_position = {
        "latitude": 37.2,
        "longitude": 126.2,
        "altitude": 120.0,
    }

    position = _display_position_for_frame(
        actual_position=actual_position,
        corrected_position=corrected_position,
        correction_applied=False,
    )

    assert position == actual_position
