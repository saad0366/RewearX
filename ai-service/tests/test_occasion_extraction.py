"""Occasion extraction checks; model calls are mocked, no training or downloads."""
import unittest
from unittest.mock import patch
from flask import Flask
from services.occasion_extraction import extract_occasions, SUPPORTED_OCCASIONS

VALUES = [{'name': name, 'description': name} for name in SUPPORTED_OCCASIONS]


class OccasionExtractionTests(unittest.TestCase):
    def test_explicit_examples_and_variations(self):
        for query, label in [('wedding dress', 'wedding'), ('party lehenga', 'party'),
                             ('formal black shirt', 'formal'), ('casual hoodie', 'casual'),
                             ('sports jacket', 'sports'), ('for a wedding', 'wedding'),
                             ('party wear', 'party'), ('formal wear', 'formal'),
                             ('sportswear', 'sports'), ('casual wear', 'casual'),
                             ('  WEDDING  dress ', 'wedding')]:
            with self.subTest(query=query):
                self.assertEqual(extract_occasions(query, VALUES),
                                 [{'name': label, 'score': 1.0, 'source': 'explicit_keyword'}])

    def test_no_semantic_invention_or_partial_word_match(self):
        for query in ('black shirt', 'elegant celebration garment', 'informal dress',
                      'sport shirt', 'weddings', 'warm hoodie'):
            self.assertEqual(extract_occasions(query, VALUES), [])

    def test_offered_taxonomy_and_multiple_explicit_intents(self):
        self.assertEqual(extract_occasions('wedding dress', [{'name': 'business'}]), [])
        self.assertEqual([m['name'] for m in extract_occasions('casual or formal shirt', VALUES)],
                         ['casual', 'formal'])

    def test_both_actual_route_implementations_and_legacy_attributes(self):
        # Import with a fake loader so app warmup/route singletons cannot download.
        with patch('models.distilbert_loader.MiniLMLoader') as loader:
            loader.return_value.embed_one.return_value = [0.1, 0.2]
            import app as application
            import routes.recommendation as recommendation
        public = application.create_app()
        blueprint = Flask('blueprint_test')
        blueprint.register_blueprint(recommendation.recommendation_bp)
        expected = [{'name': 'black', 'score': 0.9}]
        for client, endpoint, target in [
            (public.test_client(), '/api/query/attributes', 'routes.recommendation._nlp'),
            (public.test_client(), '/query/attributes', 'app.NLService'),
            (blueprint.test_client(), '/api/query/attributes', 'routes.recommendation._nlp')
        ]:
            with patch(target) as service:
                nlp = service.return_value if target == 'app.NLService' else service
                nlp.match_attribute.return_value = expected
                response = client.post(endpoint, json={
                    'query': 'formal black shirt', 'categories': [{'name': 'Shirts'}],
                    'colors': [{'name': 'black'}], 'genders': [{'name': 'male'}],
                    'conditions': [{'name': 'good'}], 'occasions': VALUES, 'threshold': 0.8})
                self.assertEqual(response.status_code, 200)
                for head in ('category', 'color', 'gender', 'condition'):
                    self.assertEqual(response.json[head], expected)
                self.assertEqual(response.json['occasion'],
                                 [{'name': 'formal', 'score': 1.0, 'source': 'explicit_keyword'}])
                self.assertEqual(nlp.match_attribute.call_count, 4)
                response = client.post(endpoint, json={
                    'query': 'black shirt', 'colors': [{'name': 'black'}], 'occasions': VALUES})
                self.assertEqual(response.json['occasion'], [])


if __name__ == '__main__':
    unittest.main()
